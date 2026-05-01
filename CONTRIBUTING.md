# Contributing

Thanks for your interest. This guide covers how the codebase is organized and how to add common things without breaking the layered governance model.

## Repo layout

```
gateway/        Express + TypeScript governance gateway (port 8001)
apps/           Static frontend (dashboards + chat + product explorer)
infra/kong/     Kong declarative config and custom plugins
docs/           Architecture diagrams
Dockerfile      Single-container build for Railway deploys
```

The two important boundaries to keep in mind:

1. **Kong layer** (`infra/kong/`) handles infrastructure concerns: auth, rate limiting, CORS, AI prompt guard. Lua-based, configured via `kong.yml`.
2. **Gateway layer** (`gateway/src/`) handles business logic: PII masking, budget enforcement, smart model routing, audit logging. TypeScript.

If a feature is about *who can call what*, it usually goes in Kong. If it's about *what the LLM can see*, it usually goes in the gateway.

## Local dev

```bash
# Terminal 1: gateway
cd gateway && npm install && npm run dev

# Terminal 2: dashboard
cd apps && npm install && npm start

# Terminal 3 (optional): Kong
docker run -d --name kong-gateway \
  -e "KONG_DATABASE=off" \
  -e "KONG_DECLARATIVE_CONFIG=/kong/kong.yml" \
  -e "KONG_LICENSE_PATH=/kong/license.json" \
  -e "KONG_PROXY_LISTEN=0.0.0.0:8000" \
  -v "$(pwd)/infra/kong:/kong" \
  -p 8000:8000 \
  kong/kong-gateway:3.9
```

If Kong isn't running, the dashboard's `config.ts` falls back to hitting the gateway directly on port 8001.

## Adding a new dashboard page

1. Create a new folder under `apps/dashboard/your-page-name/` with an `index.html`
2. Add the route to `apps/dashboard/shared/src/navigation.ts` PAGES map
3. Add a sidebar entry to `apps/dashboard/shared/src/layout.ts` NAV_ITEMS
4. Run `npm run build` from `apps/` to recompile shared TypeScript
5. Set `window.PAGE_INFO = { key: 'your-page-name', title: 'Your Page' }` in your HTML

Folder names use hyphens, not underscores. Layout chrome (sidebar, top bar) is injected by `shared/dist/layout.js`, so your page only needs the body content.

## Adding a new governance rule

### Block a new PII pattern at Kong

Edit `infra/kong/kong.yml`, find the `ai-prompt-guard` plugin under `ai-chat` route, and add a regex to `deny_patterns`. Restart Kong.

### Mask or block at the gateway

Edit `gateway/src/plugins/pii-blocker.ts`:
- `SENSITIVE_PATTERNS` for things to always block
- `MASKABLE_PATTERNS` for things that can be redacted depending on app policy
- `BLOCKED_KEYWORDS` for plain text matches

### Per-app policy override

Edit `gateway/src/plugins/app-policy.ts` to add or change a per-app entry. Each app can declare its own PII policy, model access, max prompt length, and budget.

## Adding a new API endpoint

Routes live in `gateway/src/routes/`. Each file mounts under a path prefix in `gateway/src/index.ts`. When you add a route that calls the LLM, remember to:

1. Authenticate with `authMiddleware` (already applied to most routers)
2. Run `scanAndProcess()` for PII handling
3. Check `checkBudget()` before forwarding
4. Call `forwardToLLM()` and log via `logRequest({ ..., endpoint: "/your/path" })`

The `endpoint` field is what shows in the audit log, so set it accurately.

## Working with the audit log

The SQLite schema is in `gateway/src/services/logger.ts`. Don't edit the table definition without adding an `ALTER TABLE` migration block — running gateways have existing data.

To extend the schema:

```typescript
const cols = db.prepare("PRAGMA table_info(request_logs)").all() as { name: string }[];
if (!cols.some((c) => c.name === "your_new_column")) {
  db.exec("ALTER TABLE request_logs ADD COLUMN your_new_column TEXT DEFAULT ''");
}
```

## Conventions

- Folder names: hyphens, not underscores (`team-comparison`, not `team_comparison`)
- TypeScript everywhere it touches Node.js — frontend shared modules compile via `tsc` to `apps/dashboard/shared/dist/`
- No co-author tags in commit messages — use `attribution.commit: ""` in `.claude/settings.local.json` if working with AI tools
- Don't commit `.env`, `node_modules/`, `dist/`, or `*.db` — all in `.gitignore`
- Keep Kong-only concerns in `kong.yml` and gateway-only concerns in `gateway/src/`. Don't duplicate logic across layers.

## Deploying

Production deploys go to Railway via the root `Dockerfile`. The gateway serves both the API and static dashboard from a single container. Railway env vars to set:

- `OPENROUTER_BASE_URL` (e.g. `https://openrouter.ai/api`)
- `OPENROUTER_API_KEY`
- `PORT` is injected automatically by Railway

Push to `master` and Railway redeploys automatically. Watch the deploy logs from the Railway dashboard.

## Common pitfalls

- **Wrong env var values**: Railway stores the literal value including any quotes you paste. Don't wrap values in quotes.
- **Stale Kong cache**: After editing `kong.yml`, you need `docker rm -f kong-gateway` and a fresh `docker run` to pick up the new config.
- **Frontend changes not visible**: Run `npm run build` in `apps/` to recompile TypeScript shared modules, and hard-refresh the browser (Ctrl+Shift+R).
- **Audit log shows wrong endpoint**: Each route must pass its own `endpoint` field to `logRequest()`. Default is `/ai/chat` and that's wrong for `/api/customer-chat`, `/api/service-cases/triage`, etc.

## Getting help

Open an issue on GitHub. Tag it `question` if you're not sure whether it's a bug.
