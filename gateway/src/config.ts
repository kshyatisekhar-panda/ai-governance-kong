import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { ClientIdentity } from "./types.js";

// Load .env file
const __dirname = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(__dirname, "../.env"),
  resolve(process.cwd(), ".env"),
];

for (const envPath of candidates) {
  if (!existsSync(envPath)) continue;
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
  break;
}

export const config = {
  port: parseInt(process.env.PORT || "8001", 10),
  // Default provider is OpenRouter. Real keys must come from .env (never
  // committed) and never reach the browser — only the server reads them.
  llmProvider: (process.env.LLM_PROVIDER || "openrouter").toLowerCase(),
  llmBaseUrl: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
  llmApiKey: process.env.LLM_API_KEY || "",
  // OpenRouter requires HTTP-Referer + X-Title for attribution. These are
  // safe to expose; only the API key must stay server-side.
  openrouterSiteUrl: process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
  openrouterAppName: process.env.OPENROUTER_APP_NAME || "AI-Governed Customer Service Hub",
  smallModel: process.env.SMALL_MODEL || "openai/gpt-4o-mini",
  largeModel: process.env.LARGE_MODEL || "openai/gpt-4o",
  sqlitePath: process.env.SQLITE_PATH || "./ai_gateway.db",
  allowDemoReset: (process.env.ALLOW_DEMO_RESET || "").toLowerCase() === "true",
} as const;

export const API_KEYS: Record<string, ClientIdentity> = {
  "eng-key-2024": { team: "Compressor Technique", app: "Service Assistant" },
  "ds-key-2024": { team: "Vacuum Technique", app: "Product Explorer" },
  "mkt-key-2024": { team: "Power Technique", app: "Sales Copilot" },
  "chat-key-2024": { team: "Industrial Technique", app: "Atlas Chat" },
  "scheduler-key-2024": { team: "Vacuum Technique", app: "Report Scheduler" },
};
