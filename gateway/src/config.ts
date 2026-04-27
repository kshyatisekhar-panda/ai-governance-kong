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
  llmBaseUrl: process.env.LLM_BASE_URL || "https://api.cerebras.ai",
  llmApiKey: process.env.LLM_API_KEY || "",
  sqlitePath: process.env.SQLITE_PATH || "./ai_gateway.db",
} as const;

export const API_KEYS: Record<string, ClientIdentity> = {
  "eng-key-2024": { team: "Compressor Technique", app: "Service Assistant" },
  "ds-key-2024": { team: "Vacuum Technique", app: "Product Explorer" },
  "mkt-key-2024": { team: "Power Technique", app: "Sales Copilot" },
  "chat-key-2024": { team: "Industrial Technique", app: "Atlas Chat" },
  "scheduler-key-2024": { team: "Vacuum Technique", app: "Report Scheduler" },
};
