# Enterprise AI Gateway and Governance | Proof of Concept

**Atlas Copco** hackathon challenge, organized by **2Hero**, powered by **Kong**.

![Hackathon Brief](docs/hackathon-brief.webp)

## The Challenge

> Organizations use many AI tools across applications, APIs, and LLMs, but usage is fragmented and ungoverned. This creates risks around sensitive data exposure, inconsistent policy enforcement, and lack of visibility into AI usage and costs across the enterprise.
>
> Build a centralized AI Gateway PoC that intercepts all AI requests, applies security and governance rules, and provides visibility into usage and costs across applications.

---

## What's the LLM provider?

**OpenRouter** is the default. Set up your `.env` from `.env.example`:

```env
LLM_PROVIDER=openrouter
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=sk-or-...                     # only in local .env, never committed
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=AI-Governed Customer Service Hub
SMALL_MODEL=openai/gpt-4o-mini
LARGE_MODEL=openai/gpt-4o
```

The gateway calls `${LLM_BASE_URL}/chat/completions` with the standard
OpenAI-compatible body and adds OpenRouter's required `HTTP-Referer` and
`X-Title` headers. **The browser never sees `LLM_API_KEY`** — only the server
reads it.

If you want to demo offline, set `LLM_PATH_MODE=mock`. The gateway will return
deterministic mock responses without contacting OpenRouter.

---

## Two-minute manager version

Most companies use AI in many apps and teams. Without a gateway, **anyone can send anything to a model** —
including SSNs, internal data, or proprietary specs — and nobody sees what's happening or what it costs.

This PoC fixes that by sending every AI request through a **two-layer governed path**:

1. **Kong (the network layer)** — checks the API key, applies a rate limit, blocks oversized payloads, and runs a
   first-pass PII filter (SSN, credit card, personnummer, "password", "secret key" etc.).
2. **The governance app (the business layer)** — applies per-app PII rules (mask vs block), checks the team's
   monthly budget, picks small or large model, and writes an audit row.
3. **The LLM** — only called after both layers pass. Blocked requests never reach the model.
4. **The audit log (SQLite)** — every decision is recorded with team, app, model, cost, latency, and which
   layer made the decision. Compliance and finance read the same table.

What this gives the business:

- **Risk reduction** — sensitive data is rejected before the model sees it.
- **Cost visibility** — every call is costed by team, app, and model.
- **Compliance evidence** — a permanent audit trail per request, including which layer enforced the rule.

Open `dashboard/executive-overview/` for the manager view; it has a 4-step demo checklist
(safe / sensitive PII / maskable PII / complex business question).

---

## Developer architecture version

```
Browser / Dashboard
  → Kong Gateway              (infra/kong/kong.yml, port 8000)
      key-auth · rate-limiting · request-size-limiting
      bot-detection · cors · response-transformer
      ai-prompt-guard         (only on /ai/chat)
  → Express Governance App    (gateway/src, port 8001)
      authMiddleware          (gateway/src/middleware/auth.ts)
      pii-blocker             (gateway/src/plugins/pii-blocker.ts)
      cost-tracker / budget   (gateway/src/plugins/cost-tracker.ts)
      smart-router            (gateway/src/plugins/smart-router.ts)
      api-detector            (gateway/src/plugins/api-detector.ts)
      audit-logger            (gateway/src/services/logger.ts)
  → LLM provider              (OpenRouter, /chat/completions on /api/v1)
      small: openai/gpt-4o-mini   (override with SMALL_MODEL)
      large: openai/gpt-4o        (override with LARGE_MODEL)
  → SQLite audit log          (request_logs table)
  → Dashboard                 (apps/dashboard/**)
```

### Request lifecycle, end to end

For `POST /ai/chat`:

1. Kong validates the API key, applies the per-consumer rate limit, runs `ai-prompt-guard` against deny
   patterns. If a pattern matches, **Kong returns 400 and Express never sees the request.**
2. Express runs `authMiddleware` to map the API key to a `{ team, app }`.
3. The chat router (`gateway/src/routes/chat.ts`) runs the app pipeline in order: prompt-length check →
   PII scan → budget check → smart router → API detector → LLM call → cost calc → audit log write.
4. Each non-LLM step can short-circuit and write a `blocked` row with `decision_layer = "express"`.
5. If everything passes, the LLM is called and the row is written with `decision_layer = "llm"` and
   `llm_called = 1`.
6. The response includes a `lifecycle` object with the Kong evidence the app was able to observe.

### Honest LLM path mode

Today, Express calls the LLM provider directly. We don't pretend Kong sits between Express and the provider —
the audit row's `llm_path_mode` field records this truthfully.

| Mode | Description | Status |
|---|---|---|
| `direct-provider` | Express → OpenRouter directly | **active** (default) |
| `kong-ai-route` | Express → Kong `ai-proxy` → provider | future work — needs a non-loopback Kong route |
| `mock` | Stub responses for tests | opt-in via `LLM_PATH_MODE=mock` |

### Kong evidence and "observed / configured / unknown"

The dashboard's Request Lifecycle Evidence panel labels every claim:

- **observed** — confirmed from a header, response field, or log row the app actually saw.
- **configured** — read from `infra/kong/kong.yml` (e.g. "key-auth is configured on this route"). The app
  cannot inspect Kong's runtime, so it can only report what config says should run.
- **unknown** — the app has no way to verify this from where it sits.

`gateway/src/plugins/kong-evidence.ts` builds this object from request headers (`Via`, `x-consumer-username`,
`x-forwarded-for`, etc).

---

## Demo script

### Prereqs

- Node 18+
- Docker (for Kong)
- An [OpenRouter](https://openrouter.ai) API key (free tier works fine; any OpenAI-compatible provider also works if you change `LLM_BASE_URL`)

### 1. Start the gateway

```bash
cd gateway
cp ../.env.example .env       # placeholders only — never commit a real key
# Edit .env and put your real key in LLM_API_KEY
npm install
npm run dev
```

Default provider is **OpenRouter** (`LLM_BASE_URL=https://openrouter.ai/api/v1`).
The gateway sends `Authorization: Bearer <LLM_API_KEY>`, plus the OpenRouter
attribution headers `HTTP-Referer` and `X-Title`. Models default to
`openai/gpt-4o-mini` (small) and `openai/gpt-4o` (large) — override with
`SMALL_MODEL` and `LARGE_MODEL`.

The browser **never** sees `LLM_API_KEY`. Only the server reads it; the
dashboard talks to Express, and Express talks to OpenRouter.

Express runs on `http://localhost:8001`, creates `ai_gateway.db`, and seeds it with sample audit rows.

### 2. Start Kong

Drop your Kong Enterprise license JSON at `infra/kong/license.json` (the path
is git-ignored — see `.gitignore`). Then either use the bundled compose file
(recommended):

```bash
docker compose -f infra/kong/docker-compose.yml up -d
```

…or run it manually:

```bash
docker rm -f kong-gateway 2>/dev/null
docker run -d --name kong-gateway \
  -e "KONG_DATABASE=off" \
  -e "KONG_DECLARATIVE_CONFIG=/kong/kong.yml" \
  -e "KONG_LICENSE_PATH=/kong/license.json" \
  -e "KONG_PROXY_LISTEN=0.0.0.0:8000" \
  -v "$(pwd)/infra/kong:/kong:ro" \
  -p 8000:8000 \
  kong/kong-gateway:3.9
```

Kong proxies on `http://localhost:8000`. Plugins from `infra/kong/kong.yml` are
applied. With a valid license loaded, Kong's enterprise AI plugins (e.g.
`ai-rate-limiting-advanced`) become available — the free-mode plugins
(`ai-prompt-guard`, `key-auth`, `rate-limiting`, etc.) work either way.

> The license file is **never** committed. `.gitignore` blocks
> `infra/kong/license.json`, `**/license.json`, `**/kong-license.json`, and
> `*.license.json`. If you receive a license, save it locally and that's it.

### 3. Start the dashboard

```bash
cd apps
npm install
npm start
```

Dashboard runs on `http://localhost:3000`.

### 4. Try the four demo prompts

Open `http://localhost:3000/dashboard/executive-overview/` for the manager view, then `http://localhost:3000/chat/`
for the chat. Send each prompt and look at the Governance Audit Dashboard's Request Lifecycle Evidence panel
after each one.

| # | Prompt | Expected result |
|---|---|---|
| 1 | `What is Atlas Copco?` | Kong passes → App passes → LLM called. Audit row `ALLOWED`, `decided by LLM (after pass)`. |
| 2 | `My SSN is 123-45-6789` | Rejected before the LLM. Decision layer is **Kong** (ai-prompt-guard) or **App governance** (pii-blocker), depending on which fired first. **`llmCalled: false`**. |
| 3 | `Email me at john@example.com` | For lenient apps (Service Assistant, Product Explorer): email replaced with `[EMAIL_REDACTED]`, LLM called, audit row `MASKED`. For strict apps (Atlas Chat, Sales Copilot): blocked. |
| 4 | `Analyze quarterly revenue trends` | Smart router picks the large model, API detector injects mock sales data, audit row `ALLOWED` with model + cost. |

### 5. Verify with curl

```bash
# Safe
curl -s -X POST http://localhost:8000/ai/chat \
  -H "x-api-key: eng-key-2024" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is Atlas Copco?"}]}' | jq .lifecycle

# Sensitive PII
curl -s -X POST http://localhost:8000/ai/chat \
  -H "x-api-key: eng-key-2024" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"My SSN is 123-45-6789"}]}'
```

---

## Kong vs App responsibility matrix

| Responsibility | Kong | Express App | OpenRouter | Audit Dashboard |
|---|:-:|:-:|:-:|:-:|
| API key authentication | ✓ | | | |
| Per-consumer rate limit | ✓ | | | |
| Request size limit | ✓ | | | |
| CORS | ✓ | | | |
| Bot detection | ✓ | | | |
| First-pass prompt guard (SSN/cc/keyword regex) | ✓ | | | |
| Adds `X-Governance-*` response headers | ✓ | | | |
| Map API key to team / app | | ✓ | | |
| Per-app PII policy (mask vs block) | | ✓ | | |
| Per-team monthly budget | | ✓ | | |
| Small vs large model selection | | ✓ | | |
| Inject business data context (API detector) | | ✓ | | |
| Compute cost per call | | ✓ | | |
| Write audit row | | ✓ | | |
| Generate completion | | | ✓ | |
| Show decision lifecycle, who-did-what evidence | | | | ✓ |
| Surface compliance audit trail | | | | ✓ |

---

## Dashboard pages

| Page | URL | Audience | Description |
|---|---|---|---|
| Executive Overview | `/dashboard/executive-overview/` | Manager | Plain-language metrics, "who did what" cards, 4-step demo checklist. |
| Governance Audit | `/dashboard/governance-audit-dashboard/` | Both | Live audit log + per-row Request Lifecycle Evidence panel. |
| App Policies | `/dashboard/app-policies/` | Both | Per-app cards (API key, team, Kong rate limit, PII policy, budget, models). |
| Gateway Flow | `/dashboard/gateway-flow-architecture/` | Developer | Architecture diagram + file-level mapping + curl reproduction. |
| Product Data | `/dashboard/product-service-data-explorer/` | Developer | Mock business data browser. |
| Chat | `/chat/` | Both | Drives the demo. |

---

## API keys

Pre-configured demo keys. Use in the `x-api-key` header:

| Key | Team | App | Kong rate limit |
|---|---|---|---|
| `eng-key-2024` | Compressor Technique | Service Assistant | 60/min |
| `ds-key-2024` | Vacuum Technique | Product Explorer | 40/min |
| `scheduler-key-2024` | Vacuum Technique | Report Scheduler | 40/min |
| `mkt-key-2024` | Power Technique | Sales Copilot | 20/min |
| `chat-key-2024` | Industrial Technique | Atlas Chat | 30/min |

## Per-app governance policies

| App | PII policy | Masking | Budget/mo | Models | Max prompt |
|---|---|---|---|---|---|
| Service Assistant | Block sensitive | Yes | $150 | Both | 5000 chars |
| Product Explorer | Block sensitive | Yes | $100 | Both | 2000 chars |
| Atlas Chat | Strict — block all | No | $50 | Small only | 500 chars |
| Sales Copilot | Strict — block all | No | $30 | Small only | 1000 chars |
| Report Scheduler | Block sensitive | Yes | $80 | Both | 10000 chars |

## API endpoints

**Chat (full pipeline)**
- `POST /ai/chat` — full governance pipeline. Returns the LLM completion plus a `lifecycle` block.

**Governance (used by the dashboard)**
- `GET /api/governance/stats` — aggregated metrics.
- `GET /api/governance/logs` — filtered audit log. Each row carries a `lifecycle` object with `decisionLayer`, `llmCalled`, `llmPathMode`, `kongRoute`, `kongProcessed`, etc.

**Admin**
- `GET /admin/budgets` — team budget status.
- `GET /admin/policies` — per-app policy.
- `GET /admin/lifecycle/kong` — Kong plugins configured per route, plus the current `LLM_PATH_MODE`.
- `GET /admin/logs`, `GET /admin/stats`, `GET /admin/stats/by-team`, `GET /admin/stats/by-model`, `GET /admin/stats/today`.

**Business data**
- `GET /api/products`, `POST /api/products/ask`, `GET /api/sales`, `GET /api/filters`.

## Demo reset & seeded scenarios

The audit log is seeded on first boot with one row of each canonical scenario:

| Scenario | Decision | Layer | LLM called? |
|---|---|---|---|
| Safe prompt | ALLOWED | LLM (after pass) | yes |
| Maskable PII | MASKED | App governance | yes (with safe text) |
| Sensitive PII (SSN) | BLOCKED | App governance | no |
| Bulk-export keyword | BLOCKED | App governance | no |
| Complex business question | ALLOWED | LLM (after pass) | yes (large model) |
| Over-budget team | BLOCKED | App governance | no |

To reset between demos:

```bash
# Start the gateway with the demo reset endpoint enabled:
ALLOW_DEMO_RESET=true npm --prefix gateway run dev

# Then, from anywhere on localhost:
npm --prefix gateway run demo:reset
```

The endpoint is `POST /admin/demo-reset`. It refuses to run unless
`ALLOW_DEMO_RESET=true`, and it only accepts loopback callers. Use
`DEMO_RESET_ALLOW_REMOTE=true` to override that for local Docker setups.

## Smoke check

```bash
cd gateway
npm run smoke
```

Sends safe / sensitive / maskable / complex prompts at the running gateway and verifies the lifecycle fields.
The script targets Express directly (`:8001`) by default — to verify the full Kong path, set
`SMOKE_BASE=http://localhost:8000` before running.

## Project structure

```
gateway/                       Express governance app
  src/
    index.ts                   entry, static server for apps/
    config.ts, types.ts
    middleware/auth.ts, cors.ts
    plugins/
      pii-blocker.ts           PII scan / mask / block
      cost-tracker.ts          per-team budget + cost calc
      smart-router.ts          small vs large
      api-detector.ts          inject business data context
      app-policy.ts            per-app rules
      kong-evidence.ts         build kongEvidence from request headers
    routes/
      chat.ts                  /ai/chat full pipeline
      admin.ts                 /admin/* (incl. /admin/lifecycle/kong)
      compat.ts                /api/governance/* (with lifecycle data)
      business.ts              /api/sales etc
    services/
      llm-client.ts            forwardToLLM + getLlmPathMode
      logger.ts                SQLite audit log + lifecycle columns
      seed.ts                  demo seed rows
  scripts/
    smoke.mjs                  4-prompt smoke check

apps/                          Static dashboard + chat
  dashboard/
    executive-overview/        Manager Demo page
    governance-audit-dashboard/ Audit log + lifecycle panel
    app-policies/              Per-app governance cards
    gateway-flow-architecture/ Developer architecture page
    product-service-data-explorer/
    shared/                    api-client, render-utils (incl. lifecyclePanelHtml), navigation, layout
  chat/                        Demo chat
  product-explorer/

infra/kong/
  kong.yml                     Kong declarative config (services, routes, plugins, consumers)

docs/
```

## Tech stack

| Component | Technology |
|---|---|
| API Gateway | Kong Gateway 3.9 (free mode, no enterprise license required) |
| Kong AI Plugins | `ai-prompt-guard` (active on `/ai/chat`) |
| Governance Gateway | TypeScript, Express, Node.js |
| LLM Provider | OpenRouter (default; OpenAI-compatible) |
| Database | SQLite via `better-sqlite3` |
| Dashboard | TypeScript, HTML, Tailwind CSS |
| Frontend serving | `serve` (port 3000) |

## What this PoC does *not* do

- We **don't** put Kong's `ai-proxy` between Express and the LLM. The `llm_path_mode` field documents this.
- We **don't** claim Kong observed each plugin running — the dashboard distinguishes "observed" headers
  from "configured" plugins.
- We **don't** mock Kong's response. If Kong is offline, the dashboard says so and the app keeps working
  (you can hit Express directly on `:8001`, but you lose the Kong layer).
