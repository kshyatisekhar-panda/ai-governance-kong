import { config } from "../config.js";
import type { ChatMessage, LLMResponse, LlmPathMode, ModelTier } from "../types.js";

// Map our internal "small" / "large" tier to whatever model id the configured
// provider expects. Defaults are OpenRouter's gpt-4o-mini / gpt-4o, but they
// can be overridden via SMALL_MODEL / LARGE_MODEL env vars without code change.
function resolveModelId(tier: ModelTier): string {
  if (tier === "large") return config.largeModel;
  return config.smallModel;
}

// LLM path mode is honest documentation, not enforcement. Today the gateway
// calls OpenRouter directly from Express. If a future change wires Kong's
// ai-proxy plugin in front of the provider, set LLM_PATH_MODE=kong-ai-route
// and KONG_AI_ROUTE_URL. We never silently swap paths.
export function getLlmPathMode(): LlmPathMode {
  const explicit = process.env.LLM_PATH_MODE as LlmPathMode | undefined;
  if (explicit === "direct-provider" || explicit === "kong-ai-route" || explicit === "mock") {
    return explicit;
  }
  return "direct-provider";
}

// Sanitized error string for logs/responses. Never include the API key, which
// can sometimes appear in upstream error bodies.
function redact(str: string): string {
  if (!str) return "";
  let out = str;
  if (config.llmApiKey) {
    out = out.split(config.llmApiKey).join("[REDACTED_API_KEY]");
  }
  return out.length > 600 ? out.slice(0, 600) + "…" : out;
}

export async function forwardToLLM(
  messages: ChatMessage[],
  model: ModelTier,
): Promise<LLMResponse> {
  if (getLlmPathMode() === "mock") {
    return mockResponse(messages, model);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // OpenRouter attribution headers (always safe to send).
    "HTTP-Referer": config.openrouterSiteUrl,
    "X-Title": config.openrouterAppName,
  };

  if (config.llmApiKey) {
    headers["Authorization"] = `Bearer ${config.llmApiKey}`;
  }

  // OpenRouter (and most OpenAI-compatible providers) expect /chat/completions
  // under the v1 prefix. config.llmBaseUrl is set to the v1 root in .env.example.
  const url = `${config.llmBaseUrl.replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages,
      model: resolveModelId(model),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM responded with status ${response.status}: ${redact(error)}`);
  }

  return response.json() as Promise<LLMResponse>;
}

// Mock provider for offline tests. Honest about usage numbers — they're
// derived from the prompt length, not invented.
function mockResponse(messages: ChatMessage[], model: ModelTier): LLMResponse {
  const inputChars = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
  const inputTokens = Math.max(1, Math.round(inputChars / 4));
  const outputTokens = 25;
  return {
    id: `mock-${Date.now()}`,
    object: "chat.completion",
    model: resolveModelId(model),
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "[mock] LLM_PATH_MODE=mock — no provider was called." },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
    latency_ms: 1,
  };
}
