import Database from "better-sqlite3";

// Canonical demo scenarios. After /admin/demo-reset (or first boot of an
// empty DB) the audit log holds these rows, so the dashboard always shows:
//   - one ALLOWED  (LLM called, decision_layer = "llm")
//   - one MASKED   (App layer masked PII, LLM still called)
//   - one BLOCKED  (App layer rejected sensitive PII, LLM not called)
//   - one BUDGET-blocked  (App layer rejected, LLM not called)
//   - one COMPLEX  (LLM called via large model)
//   - a few historical successes for stats charts
//
// All rows include the lifecycle / Kong-evidence columns so the dashboard
// trace works even before any live traffic.
const SCENARIOS: Array<Record<string, unknown>> = [
  // ALLOWED — safe prompt, small model, LLM called.
  {
    timestamp: "2026-04-27 09:00:00",
    team: "Compressor Technique", app: "Service Assistant",
    model: "openai/gpt-4o-mini", prompt_length: 32,
    input_tokens: 14, output_tokens: 28, cost_usd: 0.000084, latency_ms: 220,
    status: "passed", block_reason: "",
    decision_layer: "llm", kong_route: "/ai/chat", kong_processed: "observed",
    llm_called: 1, llm_path_mode: "direct-provider",
    data_source: "", pii_masked_types: "", policy_applied: "app:Service Assistant",
  },
  // MASKED — email is masked, LLM still called.
  {
    timestamp: "2026-04-27 09:15:00",
    team: "Vacuum Technique", app: "Product Explorer",
    model: "openai/gpt-4o-mini", prompt_length: 50,
    input_tokens: 18, output_tokens: 36, cost_usd: 0.000108, latency_ms: 240,
    status: "masked", block_reason: "email",
    decision_layer: "llm", kong_route: "/ai/chat", kong_processed: "observed",
    llm_called: 1, llm_path_mode: "direct-provider",
    data_source: "", pii_masked_types: "email", policy_applied: "app:Product Explorer",
  },
  // BLOCKED — sensitive PII rejected, LLM not called.
  {
    timestamp: "2026-04-27 09:30:00",
    team: "Compressor Technique", app: "Service Assistant",
    model: "", prompt_length: 24,
    input_tokens: 0, output_tokens: 0, cost_usd: 0, latency_ms: 2,
    status: "blocked", block_reason: "ssn",
    decision_layer: "express", kong_route: "/ai/chat", kong_processed: "observed",
    llm_called: 0, llm_path_mode: "direct-provider",
    data_source: "", pii_masked_types: "", policy_applied: "app:Service Assistant",
  },
  // BLOCKED — bulk-export style request blocked by app keyword guard.
  {
    timestamp: "2026-04-27 09:45:00",
    team: "Power Technique", app: "Sales Copilot",
    model: "", prompt_length: 60,
    input_tokens: 0, output_tokens: 0, cost_usd: 0, latency_ms: 1,
    status: "blocked", block_reason: "blocked_keyword",
    decision_layer: "express", kong_route: "/ai/chat", kong_processed: "observed",
    llm_called: 0, llm_path_mode: "direct-provider",
    data_source: "", pii_masked_types: "", policy_applied: "app:Sales Copilot",
  },
  // ALLOWED — complex business question routed to large model.
  {
    timestamp: "2026-04-27 10:00:00",
    team: "Vacuum Technique", app: "Product Explorer",
    model: "openai/gpt-4o", prompt_length: 180,
    input_tokens: 95, output_tokens: 240, cost_usd: 0.0084, latency_ms: 760,
    status: "passed", block_reason: "",
    decision_layer: "llm", kong_route: "/ai/chat", kong_processed: "observed",
    llm_called: 1, llm_path_mode: "direct-provider",
    data_source: "sales", pii_masked_types: "", policy_applied: "app:Product Explorer",
  },
  // BLOCKED — over-budget team. Express returns 429 before the model.
  {
    timestamp: "2026-04-27 10:15:00",
    team: "Power Technique", app: "Sales Copilot",
    model: "", prompt_length: 40,
    input_tokens: 0, output_tokens: 0, cost_usd: 0, latency_ms: 1,
    status: "blocked", block_reason: "budget_exceeded",
    decision_layer: "express", kong_route: "/ai/chat", kong_processed: "observed",
    llm_called: 0, llm_path_mode: "direct-provider",
    data_source: "", pii_masked_types: "", policy_applied: "app:Sales Copilot",
  },
  // A few extra historical rows so the "decisions over time" chart isn't flat.
  {
    timestamp: "2026-04-26 11:00:00",
    team: "Industrial Technique", app: "Atlas Chat",
    model: "openai/gpt-4o-mini", prompt_length: 22,
    input_tokens: 9, output_tokens: 18, cost_usd: 0.000054, latency_ms: 195,
    status: "passed", block_reason: "",
    decision_layer: "llm", kong_route: "/ai/chat", kong_processed: "observed",
    llm_called: 1, llm_path_mode: "direct-provider",
    data_source: "", pii_masked_types: "", policy_applied: "app:Atlas Chat",
  },
  {
    timestamp: "2026-04-26 13:30:00",
    team: "Compressor Technique", app: "Service Assistant",
    model: "openai/gpt-4o", prompt_length: 220,
    input_tokens: 110, output_tokens: 280, cost_usd: 0.0098, latency_ms: 820,
    status: "passed", block_reason: "",
    decision_layer: "llm", kong_route: "/ai/chat", kong_processed: "observed",
    llm_called: 1, llm_path_mode: "direct-provider",
    data_source: "machines", pii_masked_types: "", policy_applied: "app:Service Assistant",
  },
];

const COLUMNS = [
  "timestamp", "team", "app", "model", "prompt_length",
  "input_tokens", "output_tokens", "cost_usd", "latency_ms",
  "status", "block_reason",
  "decision_layer", "kong_route", "kong_processed",
  "llm_called", "llm_path_mode",
  "data_source", "pii_masked_types", "policy_applied",
];

function insertScenarios(db: Database.Database): void {
  const placeholders = COLUMNS.map(() => "?").join(", ");
  const insert = db.prepare(
    `INSERT INTO request_logs (${COLUMNS.join(", ")}) VALUES (${placeholders})`
  );
  const seed = db.transaction(() => {
    for (const row of SCENARIOS) {
      insert.run(...COLUMNS.map((c) => row[c] ?? ""));
    }
  });
  seed();
}

export function seedDatabase(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) as c FROM request_logs").get() as { c: number };
  if (count.c > 0) return;
  console.log("[seed] Loading initial demo scenarios…");
  insertScenarios(db);
  console.log(`[seed] Loaded ${SCENARIOS.length} canonical demo scenarios.`);
}

// Used by POST /admin/demo-reset. Wipes audit rows and reloads scenarios.
export function resetDemoData(db: Database.Database): { rowsAfter: number } {
  db.prepare("DELETE FROM request_logs").run();
  insertScenarios(db);
  const after = db.prepare("SELECT COUNT(*) AS c FROM request_logs").get() as { c: number };
  return { rowsAfter: after.c };
}
