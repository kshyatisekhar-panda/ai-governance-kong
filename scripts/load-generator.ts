#!/usr/bin/env npx tsx

const BASE_URL = process.env.BASE_URL || "http://localhost:8001";
const TOTAL_REQUESTS = parseInt(process.env.REQUESTS || "50", 10);

// ── Atlas Copco product catalog ──────────────────────────────────────

const PRODUCTS: Record<string, string[]> = {
  "Compressor Technique": [
    "GA 37+ VSD", "GA 55 VSD+", "GA 90 VSD+", "ZR 90 VSD+",
    "ZR 160 VSD+", "ZT 55 VSD", "LE/LT Series", "NGP 25+", "NGP 50+", "FD 300 VSD",
  ],
  "Vacuum Technique": [
    "GHS 1300 VSD+", "GHS 900 VSD+", "Edwards nXDS", "Leybold PHOENIX",
  ],
  "Power Technique": [
    "XAS 188", "XATS 350", "QAS 150", "QAS 250", "HiLight V5+", "PAS 100",
  ],
  "Industrial Technique": [
    "Tensor ST61", "Tensor S7", "PRO W-Series", "Desoutter ERS", "ISRA VISION",
  ],
};

const TEAM_APP_MAP: Record<string, string> = {
  "Compressor Technique": "Service Assistant",
  "Vacuum Technique": "Product Explorer",
  "Power Technique": "Sales Copilot",
  "Industrial Technique": "Atlas Chat",
};

const API_KEYS: Record<string, { team: string; app: string }> = {
  "eng-key-2024": { team: "Compressor Technique", app: "Service Assistant" },
  "ds-key-2024": { team: "Vacuum Technique", app: "Product Explorer" },
  "mkt-key-2024": { team: "Power Technique", app: "Sales Copilot" },
  "chat-key-2024": { team: "Industrial Technique", app: "Atlas Chat" },
  "scheduler-key-2024": { team: "Vacuum Technique", app: "Report Scheduler" },
};

// ── Prompt templates ─────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomProduct(team: string): string {
  return pick(PRODUCTS[team] ?? Object.values(PRODUCTS).flat());
}

function cleanPrompt(team: string): string {
  const product = randomProduct(team);
  return pick([
    `What's the maintenance schedule for ${product}?`,
    `How does the ${product} compare to competitors?`,
    `What are the key specifications of the ${product}?`,
    `Show me the sales data for ${team} in Europe`,
    `What is the warranty policy for ${product}?`,
    `How many ${product} units were sold last quarter?`,
    `What spare parts are available for the ${product}?`,
    `Give me inventory status for ${product}`,
    `What regions sell the most ${product} units?`,
    `List the top-selling products in ${team}`,
    `What is the lead time for ordering a ${product}?`,
    `Describe the energy efficiency rating of ${product}`,
    `What training is required to operate the ${product}?`,
    `Show me the revenue breakdown for ${team} by region`,
    `What certifications does the ${product} have?`,
  ]);
}

function piiPrompt(team: string): string {
  const product = randomProduct(team);
  return pick([
    `My SSN is 123-45-6789, can you check my warranty for the ${product}?`,
    `Send the ${product} manual to john.doe@atlascopco.com please`,
    `Call me at 555-123-4567 about the ${product} repair status`,
    `My credit card is 4111-1111-1111-1111, charge the ${product} service`,
    `Contact sarah@customer.com at 08-555-1234 about ${product} delivery`,
    `My personnummer is 850101-1234, register me for ${product} training`,
    `Ship to IP 192.168.1.100 network and email report to admin@factory.se`,
    `My social security number is 987-65-4321, warranty claim for ${product}`,
    `Password for service portal is MySecret123, reset it for ${product} team`,
    `Send invoice to billing@company.com, our api key is sk-abc123xyz`,
  ]);
}

function complexPrompt(team: string): string {
  const p1 = randomProduct(team);
  const p2 = randomProduct(team);
  return pick([
    `Analyze and compare the performance trends of ${p1} and ${p2} across all regions over the last 6 months, and recommend optimization strategies for improving sales in underperforming markets during Q3 2026`,
    `Predict the demand forecast for ${team} products in Asia and Americas for the next quarter, considering seasonal trends and the current inventory levels at our Shanghai and Rock Hill warehouses`,
    `Explain the technical differences between ${p1} and ${p2}, compare their energy efficiency ratings, maintenance costs, and recommend which model is better suited for high-altitude mining operations in South America`,
    `Analyze the revenue per unit trends for ${team} and recommend a pricing strategy that accounts for regional competition, currency fluctuations, and our current market share in Europe versus Asia`,
    `Compare all product categories within ${team}, explain their market positioning, analyze the competitive landscape, and recommend which product lines should receive increased investment for the next fiscal year based on current sales momentum`,
  ]);
}

// ── Request senders ──────────────────────────────────────────────────

interface RequestResult {
  team: string;
  app: string;
  endpoint: string;
  promptType: string;
  decision: string;
  cost: number;
  latencyMs: number;
  model: string;
  error?: string;
}

async function sendCustomerChat(
  message: string,
  team: string,
  sourceApp: string,
  promptType: string,
): Promise<RequestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/customer-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, team, sourceApp }),
    });
    const latencyMs = Date.now() - start;
    const data = await res.json() as any;
    const gov = data.governance ?? {};

    return {
      team,
      app: sourceApp,
      endpoint: "/api/customer-chat",
      promptType,
      decision: gov.decision ?? (res.ok ? "ALLOWED" : "BLOCKED"),
      cost: gov.estimatedCostUsd ?? 0,
      latencyMs: gov.latencyMs ?? latencyMs,
      model: gov.model ?? "-",
    };
  } catch (err: any) {
    return {
      team, app: sourceApp, endpoint: "/api/customer-chat", promptType,
      decision: "ERROR", cost: 0, latencyMs: Date.now() - start, model: "-",
      error: err.message,
    };
  }
}

async function sendAiChat(
  message: string,
  apiKey: string,
  promptType: string,
): Promise<RequestResult> {
  const { team, app } = API_KEYS[apiKey];
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ messages: [{ role: "user", content: message }] }),
    });
    const latencyMs = Date.now() - start;
    const data = await res.json() as any;

    if (data.gateway) {
      return {
        team, app, endpoint: "/ai/chat", promptType,
        decision: data.gateway.pii_masked ? "MASKED" : "ALLOWED",
        cost: data.gateway.cost_usd ?? 0,
        latencyMs: data.gateway.latency_ms ?? latencyMs,
        model: data.gateway.model_routed ?? "-",
      };
    }

    return {
      team, app, endpoint: "/ai/chat", promptType,
      decision: res.ok ? "ALLOWED" : "BLOCKED",
      cost: 0, latencyMs, model: "-",
      error: data.error,
    };
  } catch (err: any) {
    return {
      team, app, endpoint: "/ai/chat", promptType,
      decision: "ERROR", cost: 0, latencyMs: Date.now() - start, model: "-",
      error: err.message,
    };
  }
}

// ── Color helpers ────────────────────────────────────────────────────

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function colorDecision(d: string): string {
  if (d === "ALLOWED") return c.green(d);
  if (d === "MASKED") return c.yellow(d);
  if (d === "BLOCKED") return c.red(d);
  return c.red(d);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(c.bold("\n  Atlas Copco AI Governance - Load Generator\n"));
  console.log(`  Target: ${c.cyan(BASE_URL)}`);
  console.log(`  Requests: ${TOTAL_REQUESTS}\n`);
  console.log(c.dim("  #   Team                      App                  Type      Decision   Model   Cost      Latency"));
  console.log(c.dim("  " + "─".repeat(110)));

  const teams = Object.keys(TEAM_APP_MAP);
  const apiKeys = Object.keys(API_KEYS);

  let totalCost = 0;
  let allowed = 0;
  let masked = 0;
  let blocked = 0;
  let errors = 0;

  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    const rand = Math.random();
    let promptType: string;
    let result: RequestResult;

    // ~30% go through /ai/chat, ~70% through /api/customer-chat
    const useAiChat = Math.random() < 0.3;

    if (useAiChat) {
      const apiKey = pick(apiKeys);
      const { team } = API_KEYS[apiKey];

      let message: string;
      if (rand < 0.60) {
        promptType = "clean";
        message = cleanPrompt(team);
      } else if (rand < 0.85) {
        promptType = "pii";
        message = piiPrompt(team);
      } else {
        promptType = "complex";
        message = complexPrompt(team);
      }

      result = await sendAiChat(message, apiKey, promptType);
    } else {
      const team = pick(teams);
      const app = TEAM_APP_MAP[team];

      let message: string;
      if (rand < 0.60) {
        promptType = "clean";
        message = cleanPrompt(team);
      } else if (rand < 0.85) {
        promptType = "pii";
        message = piiPrompt(team);
      } else {
        promptType = "complex";
        message = complexPrompt(team);
      }

      result = await sendCustomerChat(message, team, app, promptType);
    }

    // Track stats
    totalCost += result.cost;
    if (result.decision === "ALLOWED") allowed++;
    else if (result.decision === "MASKED") masked++;
    else if (result.decision === "BLOCKED") blocked++;
    else errors++;

    // Print row
    const num = String(i + 1).padStart(3);
    const teamCol = result.team.padEnd(25);
    const appCol = result.app.padEnd(20);
    const typeCol = result.promptType.padEnd(9);
    const decCol = colorDecision(result.decision.padEnd(10));
    const modelCol = (result.model || "-").padEnd(7);
    const costCol = `$${result.cost.toFixed(4)}`.padEnd(9);
    const latCol = `${result.latencyMs}ms`;

    console.log(`  ${num}  ${teamCol} ${appCol} ${typeCol} ${decCol} ${modelCol} ${costCol} ${latCol}`);

    // Random delay 200-2000ms
    const delay = 200 + Math.floor(Math.random() * 1800);
    await sleep(delay);
  }

  // Summary
  console.log(c.dim("\n  " + "─".repeat(110)));
  console.log(c.bold("\n  Summary"));
  console.log(`  ${c.green("Allowed")}: ${allowed}  |  ${c.yellow("Masked")}: ${masked}  |  ${c.red("Blocked")}: ${blocked}  |  Errors: ${errors}`);
  console.log(`  Total cost: ${c.cyan("$" + totalCost.toFixed(4))}`);
  console.log();
}

main().catch(console.error);
