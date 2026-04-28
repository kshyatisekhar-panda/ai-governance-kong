#!/usr/bin/env node
/* eslint-disable no-console */
// Smoke check for the AI governance gateway.
// Runs 4 prompts and asserts the lifecycle/audit fields look right.
//
// Default target is Express directly (:8001). Set SMOKE_BASE=http://localhost:8000
// to verify the Kong-fronted path.
//
// Exit code:
//   0 on all checks passing
//   1 on any failure
//   2 if the gateway is unreachable

const BASE = process.env.SMOKE_BASE || "http://localhost:8001";
const KEY = process.env.SMOKE_KEY || "eng-key-2024";

const cases = [
  {
    name: "1. Safe prompt — should ALLOW + LLM called",
    body: { messages: [{ role: "user", content: "What is Atlas Copco?" }] },
    expect: (res, json) => {
      if (!res.ok) return `expected 2xx, got ${res.status}`;
      if (!json.gateway) return "no gateway block in response";
      if (!json.lifecycle) return "no lifecycle block in response";
      if (json.lifecycle.llmCalled !== true) return `lifecycle.llmCalled !== true (got ${json.lifecycle.llmCalled})`;
      if (json.lifecycle.decisionLayer !== "llm") return `decisionLayer !== "llm" (got ${json.lifecycle.decisionLayer})`;
      return null;
    },
  },
  {
    name: "2. Sensitive PII — must NOT call the LLM",
    body: { messages: [{ role: "user", content: "My SSN is 123-45-6789" }] },
    expect: (res, json) => {
      // Either Kong's ai-prompt-guard blocks (status 400) or Express's
      // pii-blocker blocks (status 451). Both are valid, but in both cases
      // the LLM must not have been called.
      if (res.ok) return `expected non-2xx, got ${res.status}`;
      if (json.lifecycle && json.lifecycle.llmCalled === true) {
        return "lifecycle.llmCalled === true on a blocked PII request";
      }
      return null;
    },
  },
  {
    name: "3. Maskable PII — for lenient app: MASKED + LLM called, with masked types reported",
    body: { messages: [{ role: "user", content: "Email me at john@example.com about the report" }] },
    expect: (res, json) => {
      // eng-key-2024 → Service Assistant → allowMasking: true, blockEmail: false.
      if (!res.ok) return `expected 2xx for lenient app, got ${res.status}`;
      if (!json.gateway || json.gateway.pii_masked !== true) {
        return `gateway.pii_masked !== true (got ${JSON.stringify(json.gateway && json.gateway.pii_masked)})`;
      }
      if (!Array.isArray(json.gateway.masked_types) || json.gateway.masked_types.length === 0) {
        return "gateway.masked_types is empty";
      }
      if (json.lifecycle && json.lifecycle.llmCalled !== true) {
        return "lifecycle.llmCalled should be true after masking";
      }
      return null;
    },
  },
  {
    name: "4. Complex business question — should pick large model + record cost",
    body: { messages: [{ role: "user", content: "Analyze quarterly revenue trends and recommend pricing changes for compressors in Europe" }] },
    expect: (res, json) => {
      if (!res.ok) return `expected 2xx, got ${res.status}`;
      if (!json.gateway || !json.gateway.model_routed) return "no gateway.model_routed";
      if (json.gateway.model_routed !== "large") return `expected large model, got ${json.gateway.model_routed}`;
      if (typeof json.gateway.cost_usd !== "number") return "no gateway.cost_usd";
      return null;
    },
  },
];

async function call(c) {
  const url = `${BASE}/ai/chat`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY },
      body: JSON.stringify(c.body),
    });
  } catch (err) {
    console.error(`✗ ${c.name}\n  Network error: ${err}\n  Is the gateway running at ${BASE}?`);
    process.exit(2);
  }
  let json = null;
  const text = await res.text();
  if (text) {
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  }
  return { res, json };
}

// Environment / safety checks. These don't require a running gateway round
// trip — they verify static facts about the configuration so the smoke
// suite catches regressions like "we accidentally re-pointed at Cerebras".
async function configChecks(failures) {
  // 1) /admin/lifecycle/kong should report a non-empty plugin list and an
  //    LLM path mode. We use this as a proxy for "OpenRouter is configured":
  //    if LLM_BASE_URL still pointed at cerebras, the smoke would fail because
  //    the live request cases would 401 against OpenRouter, but we also do a
  //    static .env.example check below so the checked-in template is right.
  try {
    const res = await fetch(`${BASE}/admin/lifecycle/kong`);
    const json = await res.json();
    if (!json.routes || !Array.isArray(json.routes["/ai/chat"]?.plugins)) {
      failures.push("admin/lifecycle/kong: missing routes['/ai/chat'].plugins");
    }
  } catch (err) {
    failures.push(`admin/lifecycle/kong unreachable: ${err}`);
  }

  // 2) The checked-in .env.example must use OpenRouter, never Cerebras.
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "../..");
    const example = fs.readFileSync(path.join(repoRoot, ".env.example"), "utf-8");
    if (example.toLowerCase().includes("cerebras")) {
      failures.push(".env.example still references Cerebras");
    }
    if (!example.includes("openrouter.ai/api/v1")) {
      failures.push(".env.example does not point at OpenRouter (https://openrouter.ai/api/v1)");
    }
    if (!example.includes("SMALL_MODEL=openai/gpt-4o-mini")) {
      failures.push(".env.example does not declare SMALL_MODEL=openai/gpt-4o-mini");
    }
    if (!example.includes("LARGE_MODEL=openai/gpt-4o")) {
      failures.push(".env.example does not declare LARGE_MODEL=openai/gpt-4o");
    }
    // The example should use a placeholder, never a real-looking key.
    const m = example.match(/LLM_API_KEY=(.+)/);
    if (m && /^sk-or-[A-Za-z0-9]{30,}$/.test(m[1].trim())) {
      failures.push(".env.example may contain a real-looking OpenRouter key");
    }
  } catch (err) {
    failures.push(`.env.example check failed: ${err}`);
  }

  // 3) Browser-facing dashboard JS must not bake in the LLM_API_KEY.
  //    The dashboard sends x-api-key per consumer; LLM_API_KEY is server-only.
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "../..");
    const candidates = [
      "apps/dashboard/shared/src/api-client.ts",
      "apps/dashboard/shared/src/config.ts",
      "apps/dashboard/shared/dist/api-client.js",
      "apps/dashboard/shared/dist/config.js",
      "apps/chat/index.html",
    ];
    for (const rel of candidates) {
      const p = path.join(repoRoot, rel);
      if (!fs.existsSync(p)) continue;
      const text = fs.readFileSync(p, "utf-8");
      if (/LLM_API_KEY/.test(text)) {
        failures.push(`browser-facing file references LLM_API_KEY: ${rel}`);
      }
    }
  } catch (err) {
    failures.push(`browser-key check failed: ${err}`);
  }
}

(async function main() {
  console.log(`Smoke check → ${BASE} (key=${KEY})\n`);
  let failed = 0;
  for (const c of cases) {
    const { res, json } = await call(c);
    const err = c.expect(res, json);
    if (err) {
      failed += 1;
      console.error(`✗ ${c.name}`);
      console.error(`  HTTP ${res.status}`);
      console.error(`  ${err}`);
      console.error(`  body: ${JSON.stringify(json).slice(0, 400)}\n`);
    } else {
      console.log(`✓ ${c.name}`);
    }
  }

  const cfgFailures = [];
  await configChecks(cfgFailures);
  const cfgTitle = "5. Configuration safety (OpenRouter + key not in browser)";
  if (cfgFailures.length === 0) {
    console.log(`✓ ${cfgTitle}`);
  } else {
    failed += 1;
    console.error(`✗ ${cfgTitle}`);
    for (const f of cfgFailures) console.error(`  - ${f}`);
  }

  // Run the secret-leak guard as part of smoke. We invoke it as a subprocess
  // so its exit code tells us pass/fail without us re-implementing the scan.
  const secretCheck = await runSecretCheck();
  const secTitle = "6. Secret-leak guard (no committed keys / license)";
  if (secretCheck.ok) {
    console.log(`✓ ${secTitle}`);
  } else {
    failed += 1;
    console.error(`✗ ${secTitle}`);
    if (secretCheck.output) console.error(secretCheck.output.split("\n").map((l) => "  " + l).join("\n"));
  }

  const total = cases.length + 2;
  if (failed) {
    console.error(`\n${failed} of ${total} smoke check(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\nAll ${total} smoke checks passed.`);
  }
})();

async function runSecretCheck() {
  const { spawnSync } = await import("node:child_process");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const r = spawnSync(process.execPath, [path.join(here, "secret-check.mjs")], {
    encoding: "utf-8",
  });
  return { ok: r.status === 0, output: (r.stdout || "") + (r.stderr || "") };
}
