# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

PoC for an Atlas Copco hackathon: a centralized AI Gateway that intercepts every LLM request, applies governance (auth, PII, budget, model routing), and exposes a dashboard. Demo data is Atlas Copco themed (Compressor, Vacuum, Power, Industrial Technique).

## Common commands

Two installs (no root workspace):

```bash
cd gateway && npm install
cd ../apps && npm install
```

**Gateway (Express + TypeScript, port 8001):**
- `cd gateway && npm run dev` — tsx watch mode
- `cd gateway && npm start` — tsx (no watch)
- No build step; no test runner; no linter configured. The `dist/` outDir in [gateway/tsconfig.json](gateway/tsconfig.json) is unused at runtime — `tsx` runs `.ts` directly.

**Frontend dashboards (port 3000):**
- `cd apps && npm run build` — compiles only [apps/dashboard/shared/src/](apps/dashboard/shared/src/) to [apps/dashboard/shared/dist/](apps/dashboard/shared/dist/) via `tsc`. Per-page HTML is served as-is.
- `cd apps && npm start` — runs build, then `serve . -l 3000 --cors`. Dashboards expect Kong on `http://localhost:8000`; if Kong isn't running, point them at the gateway by setting `localStorage.API_BASE_URL = "http://localhost:8001"` in the browser console (see [apps/dashboard/shared/src/config.ts](apps/dashboard/shared/src/config.ts)).

**Kong (Docker, port 8000):**
```bash
docker rm -f kong-gateway 2>/dev/null
docker run -d --name kong-gateway \
  -e "KONG_DATABASE=off" \
  -e "KONG_DECLARATIVE_CONFIG=/kong/kong.yml" \
  -e "KONG_PROXY_LISTEN=0.0.0.0:8000" \
  -v "./infra/kong:/kong" \
  -p 8000:8000 \
  kong/kong-gateway:3.9
```
Reload after editing [infra/kong/kong.yml](infra/kong/kong.yml): `docker restart kong-gateway`.

**Smoke tests (no test framework — these are the canonical checks):**
```bash
curl -s http://localhost:8001/health
curl -s http://localhost:8001/api/governance/stats
curl -s "http://localhost:8001/api/governance/logs?decision=BLOCKED&limit=5" -H "x-api-key: eng-key-2024"
curl -s -X POST http://localhost:8000/ai/chat \
  -H "x-api-key: eng-key-2024" -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
```

**Single-container production build** (used by Railway, see [Dockerfile](Dockerfile)): the gateway also serves [apps/](apps/) as static files when started from `/app/gateway` in the image — the static mount is conditional on the sibling `../apps` directory existing ([gateway/src/index.ts](gateway/src/index.ts#L29-L33)).

## Configuration

- `gateway/.env` (copy from [.env.example](.env.example)) provides `LLM_BASE_URL` and `LLM_API_KEY`. The `.env` loader is hand-rolled in [gateway/src/config.ts](gateway/src/config.ts); there is no `dotenv` dependency.
- `PORT` (default 8001) and `SQLITE_PATH` (default `./ai_gateway.db`, relative to wherever the gateway is started) are also read from env.
- API keys, team mappings, model pricing, and team budgets are **hardcoded** — not env-driven:
  - Keys → team/app: `API_KEYS` in [gateway/src/config.ts](gateway/src/config.ts#L35)
  - Per-app PII/budget/model rules: `APP_POLICIES` in [gateway/src/plugins/app-policy.ts](gateway/src/plugins/app-policy.ts#L23)
  - Per-team monthly budgets and `$/1k token` pricing: [gateway/src/plugins/cost-tracker.ts](gateway/src/plugins/cost-tracker.ts#L9-L19)
  - LLM model IDs (`small` → `llama3.1-8b`, `large` → `qwen-3-235b-a22b-instruct-2507`): [gateway/src/services/llm-client.ts](gateway/src/services/llm-client.ts#L4)
  Kong's per-consumer keys/limits in [infra/kong/kong.yml](infra/kong/kong.yml) must be kept in sync with these.

## Architecture

**Two-layer governance.** Kong (8000) handles infrastructure concerns; Express (8001) handles business logic. The chat endpoint at `POST /ai/chat` is the canonical full-pipeline path. Most dashboard traffic actually hits Express directly on 8001 in dev (see config note above), so Kong's policies only fire when traffic actually goes through 8000.

```
Browser :3000 ─► Kong :8000 ─► Express :8001 ─► Cerebras LLM
```

**Kong layer ([infra/kong/kong.yml](infra/kong/kong.yml)):** key-auth, global + per-consumer rate-limiting, request-size-limiting, bot-detection, CORS, response-transformer (adds `X-Governance-*` headers). The `ai-prompt-guard` plugin runs *only* on the `/ai/chat` route as a first PII line of defense (regex deny patterns for SSN, credit card, Swedish personnummer, plus forbidden keywords). The keyword/regex set here intentionally overlaps with the Express PII blocker so behavior is consistent whether traffic comes via Kong or hits Express directly.

**Express pipeline ([gateway/src/routes/chat.ts](gateway/src/routes/chat.ts)) executes in this fixed order — preserve it:**
1. `authMiddleware` resolves `x-api-key` → `req.client = {team, app}` ([gateway/src/middleware/auth.ts](gateway/src/middleware/auth.ts))
2. Prompt length check against `policy.model.maxPromptLength`
3. `scanAndProcess` (PII): keyword block → sensitive PII block → maskable PII (mask or block per policy) ([gateway/src/plugins/pii-blocker.ts](gateway/src/plugins/pii-blocker.ts))
4. `checkBudget(team)` — month-to-date spend computed from `request_logs` (no in-memory state; `recordSpend` is intentionally a no-op, see [gateway/src/plugins/cost-tracker.ts](gateway/src/plugins/cost-tracker.ts#L63-L67))
5. `classifyPrompt` selects `small` or `large`, then policy clamps it (`allowSmall`/`allowLarge`) ([gateway/src/plugins/smart-router.ts](gateway/src/plugins/smart-router.ts))
6. `detectAPI` keyword-matches sales/machines/inventory and prepends a `system` message containing JSON business data ([gateway/src/plugins/api-detector.ts](gateway/src/plugins/api-detector.ts))
7. `forwardToLLM` (OpenAI-compatible POST to `${LLM_BASE_URL}/v1/chat/completions`)
8. `calculateCost` + `logRequest` (audit row in SQLite)

The response includes a `gateway` metadata block — every dashboard page and the chat UI rely on it.

**Routers ([gateway/src/index.ts](gateway/src/index.ts)):**
- `/ai/chat` — full pipeline, requires auth
- `/admin/*` — raw budgets/logs/stats (used by app-policies dashboard)
- `/api/*` — split between [routes/business.ts](gateway/src/routes/business.ts) (`/api/sales`, `/api/filters`) and [routes/compat.ts](gateway/src/routes/compat.ts), which provides a renamed/reshaped surface (`/api/governance/stats`, `/api/governance/logs`, `/api/customer-chat`, `/api/products`, `/api/products/ask`, `/api/service-cases`) the dashboards consume. Both routers are mounted on `/api`; **order matters** — `businessRouter` is mounted first, so any path collision wins there.

**Persistence ([gateway/src/services/logger.ts](gateway/src/services/logger.ts)):** `better-sqlite3`, single `request_logs` table created on import. [seed.ts](gateway/src/services/seed.ts) runs once at startup to populate demo rows when empty. `getMonthlySpend` uses SQLite's `datetime('now', 'start of month')` — budgets reset at month boundaries automatically. `status` column values are exactly `passed | masked | blocked`; the dashboards translate to `ALLOWED | MASKED | BLOCKED` in [routes/compat.ts](gateway/src/routes/compat.ts).

**Status semantics — read these before changing the pipeline:**
- `passed` — no PII issue, request forwarded
- `masked` — maskable PII (email/phone/IP) was redacted *and* the masked prompt was forwarded; `block_reason` carries the masked types
- `blocked` — request rejected; `block_reason` is one of: comma-list of PII types, `prompt_too_long`, `budget_exceeded`, `blocked_keyword`
Dashboards filter on `block_reason LIKE '%type%'` — keep it as a comma-separated list.

**Frontend ([apps/](apps/)):** plain HTML pages per dashboard, sharing styles ([apps/dashboard/shared/app.css](apps/dashboard/shared/app.css)) and a small TS lib in [apps/dashboard/shared/src/](apps/dashboard/shared/src/) that compiles to global IIFEs (`module: "none"`) loaded via `<script>` tags. There is no bundler, no React/framework. `window.APP_CONFIG.API_BASE_URL` and `DEMO_API_KEY` are settable from `localStorage`.

## Conventions worth knowing

- ESM throughout the gateway: imports use `.js` extensions even for `.ts` source files (required by `module: NodeNext` in [tsconfig.base.json](tsconfig.base.json)). Don't drop the `.js`.
- The 5 demo API keys, 5 app names, and 4 team names are referenced as string literals across the gateway, Kong config, and dashboard demos. If you rename one, grep across [gateway/src/](gateway/src/), [infra/kong/kong.yml](infra/kong/kong.yml), and [README.md](README.md).
- `apps/dashboard/shared/dist/` is **gitignored** but the dashboards load `dist/*.js` directly via `<script>` tags. After editing files in `shared/src/`, run `npm run build` in `apps/` or the changes won't appear in the browser. The `npm start` script builds before serving, so production deploys regenerate `dist/` at container build time.
- Kong AI plugin coverage is intentionally minimal — only `ai-prompt-guard` is active. `ai-rate-limiting-advanced` and other AI plugins are commented in [infra/kong/kong.yml](infra/kong/kong.yml) and require a Kong Enterprise license.
