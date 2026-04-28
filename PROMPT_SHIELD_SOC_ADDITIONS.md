# Prompt Shield SOC Additions

## 1. Why we added this
The hackathon is about Kong AI governance, so the demo must show Kong doing more than simple routing and authentication. The Prompt Shield SOC layer makes Kong an active AI security control point, acting as the first line of defense before traffic reaches the backend or the LLM.

## 2. What this adds
- Kong Prompt Shield custom plugin
- SOC-style dashboard views:
  - Live traffic view
  - Alerts view
  - All events view
  - Allowed models policy
  - Consistency baselines
  - Kong datapoints reference
  - Test sandbox
- Request lifecycle evidence
- Backend governance trace
- Kong Backend Terminal

## 3. Kong vs Express responsibility split

| Responsibility | Kong Prompt Shield | Express Governance App | Dashboard |
| --- | --- | --- | --- |
| API key auth | Kong | - | - |
| Rate limiting | Kong | - | - |
| Raw prompt inspection | Kong Prompt Shield | - | - |
| Sensitive pattern blocking before backend | Kong Prompt Shield | - | - |
| Business PII policy | - | Express | - |
| Team budget tracking | - | Express | - |
| Model routing | - | Express | - |
| Compliance evidence | - | - | Dashboard |
| Developer traceability | - | - | Dashboard |

## 4. Why Kong Prompt Shield matters
Kong can inspect request lifecycle data before traffic reaches the backend. This means sensitive AI prompts (such as credit cards or prompt injection attempts) can be stopped at the infrastructure layer, reducing the risk of data leakage and unnecessary processing.

## 5. Kong PDK datapoints used
- `kong.request.get_raw_body()`: Reads the incoming AI request. Used by the Prompt Shield to scan for sensitive patterns.
- `kong.request.get_body()`: Parses the JSON body to extract the prompt text.
- `kong.request.get_method()`: Context for the audit log (e.g., POST).
- `kong.request.get_path()`: Context for the audit log (e.g., /ai/chat).
- `kong.request.get_headers()`: Reference information.
- `kong.request.get_header(name)`: Reference information.
- `kong.client.get_ip()`: Identifies the requester's IP.
- `kong.client.get_forwarded_ip()`: Identifies the original IP if proxied.
- `kong.client.get_consumer()`: Identifies the authorized team.
- `kong.client.get_credential()`: Identifies the exact API key used.
- `kong.router.get_route()`: Context for the matched Kong route.
- `kong.router.get_service()`: Context for the targeted upstream service.
- `kong.response.get_status()`: Observed response status code.
- `kong.response.get_headers()`: Reference information.
- `ngx.now()`: Timestamp of the event.
- `ngx.arg[1]`: Body filter chunks (if response capture is implemented).

## 6. What the Prompt Shield blocks
- Credit card numbers
- API keys (e.g. sk-...)
- US SSNs
- Swedish personnummer
- Prompt injection patterns ("ignore previous instructions", "reveal system prompt")
- Bulk export requests ("give me all customer emails")
- Unauthorized model requests (if configured)

## 7. What the SOC dashboard shows
- **Overview:** High-level metrics, showing what Kong and Express blocked.
- **Live Traffic:** Real-time feed of AI requests and their status.
- **Alerts:** High-risk events requiring manager review.
- **All Events:** Comprehensive table with filters.
- **Consistency Baselines:** Deterministic anomaly tracking (e.g. usage spikes).
- **Allowed Models:** Team-specific model access configurations.
- **Kong Datapoints:** Reference guide explaining what data Kong collects.
- **Test Sandbox:** Demo tool to execute pre-defined safe and risky prompts.

## 8. How this improves the demo
**For managers:**
- Easier to understand risk reduction.
- Clear proof that blocked prompts never reach the LLM.
- Visibility into cost, security, and compliance.

**For developers:**
- Shows the exact layer that acted.
- Provides Kong route, plugin, and datapoint evidence.
- Easier to debug and verify.

## 9. Limitations / honest notes
- Datapoints that cannot be directly observed by the app are marked as "configured" or "unknown".
- No real Kong plugin results are faked.
- Response body capture is limited to standard Express logic; Kong response body inspection is optional and skipped if too risky for streaming.
- Custom Lua plugin support requires mounting the plugin directory via Docker volumes.

## 10. How to run and verify
1. Start the Express gateway (`npm run dev`).
2. Start Kong via Docker (`docker-compose up -d` in the `infra/kong` directory).
3. Start the dashboard (`npm start` in the `apps` directory).
4. Run the demo reset endpoint to seed scenarios.
5. Send a safe prompt.
6. Send a sensitive prompt (e.g., credit card).
7. Open the SOC dashboard and verify the blocked request says "LLM called: No".
8. Verify Kong evidence exists in the "Kong Backend Terminal" or the "Request Lifecycle Evidence" panels.
