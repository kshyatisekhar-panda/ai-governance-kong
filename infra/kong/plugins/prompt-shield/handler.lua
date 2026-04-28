local cjson = require "cjson.safe"
local http = require "resty.http"

local PromptShield = {
  PRIORITY = 900,
  VERSION = "1.0.0",
}

local SENSITIVE_PATTERNS = {
  { name = "CREDIT_CARD", pattern = "%d%d%d%d[%s%-]?%d%d%d%d[%s%-]?%d%d%d%d[%s%-]?%d%d%d%d" },
  { name = "US_SSN", pattern = "%d%d%d%-%d%d%-%d%d%d%d" },
  { name = "SWEDISH_PERSONNUMMER", pattern = "%d%d%d%d%d%d%d%d%-%d%d%d%d" },
  { name = "API_KEY", pattern = "sk%-[%w%-_]+" },
}

local PROMPT_INJECTION_KEYWORDS = {
  "ignore previous instructions",
  "reveal system prompt",
  "print system prompt",
  "bypass governance",
  "disable safety",
  "show hidden policy",
  "leak api key",
  "output all secrets"
}

local BULK_EXPORT_KEYWORDS = {
  "give me all customer emails",
  "list every phone number",
  "export all customers",
  "dump customer data"
}

local function check_patterns(text)
  local lower_text = string.lower(text)
  
  for _, p in ipairs(SENSITIVE_PATTERNS) do
    if string.match(text, p.pattern) then
      return "BLOCKED_SENSITIVE_IDENTIFIER"
    end
  end

  for _, keyword in ipairs(PROMPT_INJECTION_KEYWORDS) do
    if string.find(lower_text, keyword, 1, true) then
      return "BLOCKED_PROMPT_INJECTION"
    end
  end

  for _, keyword in ipairs(BULK_EXPORT_KEYWORDS) do
    if string.find(lower_text, keyword, 1, true) then
      return "BLOCKED_BULK_EXPORT"
    end
  end

  return nil
end

local function extract_prompt(body_table)
  local prompt_text = ""
  if type(body_table.messages) == "table" then
    for _, msg in ipairs(body_table.messages) do
      if type(msg.content) == "string" then
        prompt_text = prompt_text .. " " .. msg.content
      end
    end
  elseif type(body_table.prompt) == "string" then
    prompt_text = body_table.prompt
  end
  return prompt_text
end

function PromptShield:access(conf)
  local raw_body = kong.request.get_raw_body()
  if not raw_body then return end

  local body_table, err = cjson.decode(raw_body)
  if err or type(body_table) ~= "table" then
    return
  end

  local prompt_text = extract_prompt(body_table)
  if prompt_text == "" then return end

  local block_reason = check_patterns(prompt_text)
  
  kong.ctx.plugin.prompt_text = prompt_text
  kong.ctx.plugin.requested_model = body_table.model

  if block_reason then
    kong.ctx.plugin.decision = "BLOCKED"
    kong.ctx.plugin.block_reason = block_reason

    kong.response.set_header("X-Kong-Prompt-Shield", "blocked")
    kong.response.set_header("X-Kong-Governance-Layer", "prompt-shield")
    
    return kong.response.exit(403, {
      error = "Blocked by Kong Prompt Shield",
      decision = "BLOCKED_BY_KONG_PROMPT_SHIELD",
      blockReason = block_reason,
      layer = "Kong Prompt Shield",
      llmCalled = false
    })
  end

  kong.ctx.plugin.decision = "ALLOWED"
  kong.response.set_header("X-Kong-Prompt-Shield", "passed")
  kong.response.set_header("X-Kong-Governance-Layer", "prompt-shield")
end

local function send_log_to_express(conf, log_data)
  local httpc = http.new()
  httpc:set_timeout(2000)
  
  local backend_url = conf.backend_events_url or "http://host.docker.internal:8001/admin/kong-events"
  
  local res, err = httpc:request_uri(backend_url, {
    method = "POST",
    body = cjson.encode(log_data),
    headers = {
      ["Content-Type"] = "application/json",
      ["x-kong-internal-secret"] = conf.internal_secret or "secret"
    }
  })
  
  if not res then
    kong.log.err("Failed to send Kong event to backend: ", err)
  end
end

function PromptShield:log(conf)
  local decision = kong.ctx.plugin.decision or "UNKNOWN"
  local block_reason = kong.ctx.plugin.block_reason or ""
  
  local consumer = kong.client.get_consumer()
  local consumer_id = consumer and consumer.username or "unknown"
  
  local route = kong.router.get_route()
  local route_name = route and route.name or "unknown"

  local log_data = {
    eventId = "soc_" .. string.gsub(kong.request.get_header("kong-request-id") or tostring(ngx.now()), "-", ""),
    timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
    layer = "Kong Prompt Shield",
    decision = decision,
    blockReason = block_reason,
    method = kong.request.get_method(),
    path = kong.request.get_path(),
    clientIp = kong.client.get_ip(),
    consumer = consumer_id,
    routeName = route_name,
    model = kong.ctx.plugin.requested_model or "unknown",
    llmCalled = false,
    datapoints = {
      clientIp = "observed",
      consumer = consumer and "observed" or "unknown",
      method = "observed",
      path = "observed",
      rawBody = "observed-redacted",
      route = route and "observed" or "unknown"
    }
  }

  -- In Kong, making HTTP requests in the log phase is typically done via ngx.timer.at to avoid blocking
  local ok, err = ngx.timer.at(0, function(premature)
    if premature then return end
    send_log_to_express(conf, log_data)
  end)

  if not ok then
    kong.log.err("Failed to create timer for Kong event log: ", err)
  end
end

return PromptShield
