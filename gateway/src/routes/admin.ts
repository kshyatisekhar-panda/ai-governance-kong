import { Router } from "express";
import type { Request, Response } from "express";
import { config } from "../config.js";
import { getAllBudgets } from "../plugins/cost-tracker.js";
import { getAllPolicies } from "../plugins/app-policy.js";
import {
  db,
  getRecentLogs,
  getOverallStats,
  getStatsByTeam,
  getStatsByModel,
  getTodayStatsByTeam,
} from "../services/logger.js";
import { resetDemoData } from "../services/seed.js";

export const adminRouter = Router();

adminRouter.get("/budgets", (_req, res) => {
  res.json(getAllBudgets());
});

adminRouter.get("/logs", async (_req, res) => {
  const logs = await getRecentLogs();
  res.json(logs);
});

adminRouter.get("/stats", async (_req, res) => {
  const stats = await getOverallStats();
  res.json(stats);
});

adminRouter.get("/stats/by-team", async (_req, res) => {
  const stats = await getStatsByTeam();
  res.json(stats);
});

adminRouter.get("/stats/by-model", async (_req, res) => {
  const stats = await getStatsByModel();
  res.json(stats);
});

adminRouter.get("/stats/today", async (_req, res) => {
  const stats = await getTodayStatsByTeam();
  res.json(stats);
});

adminRouter.get("/policies", (_req, res) => {
  res.json(getAllPolicies());
});

// Lifecycle reference endpoint. Returns the Kong plugins configured per route
// (read once from kong.yml-equivalent constants) plus the current LLM path
// mode. The dashboard uses this to render observed/configured/unknown state
// honestly — the app cannot inspect Kong directly, so this is "expected
// from config", not "observed".
adminRouter.get("/lifecycle/kong", (_req, res) => {
  res.json({
    routes: {
      "/ai/chat": {
        plugins: [
          "key-auth", "rate-limiting", "cors", "request-size-limiting",
          "bot-detection", "response-transformer", "ai-prompt-guard",
        ],
        notes: "ai-prompt-guard denies SSN, credit card, personnummer, password/api-key keywords before reaching Express.",
      },
      "/api": {
        plugins: [
          "key-auth", "rate-limiting", "cors", "request-size-limiting",
          "bot-detection", "response-transformer",
        ],
      },
      "/admin": {
        plugins: [
          "key-auth", "rate-limiting", "cors", "request-size-limiting",
          "bot-detection", "response-transformer",
        ],
      },
    },
    headers: [
      { name: "X-Governance-Gateway", value: "kong", source: "configured" },
      { name: "X-Governance-Version", value: "1.0", source: "configured" },
      { name: "X-Governance-Policy", value: "enforced", source: "configured" },
    ],
    consumers: [
      { username: "compressor-technique", rateLimitPerMinute: 60, key: "eng-key-2024" },
      { username: "vacuum-technique", rateLimitPerMinute: 40, key: "ds-key-2024 / scheduler-key-2024" },
      { username: "power-technique", rateLimitPerMinute: 20, key: "mkt-key-2024" },
      { username: "industrial-technique", rateLimitPerMinute: 30, key: "chat-key-2024" },
    ],
    llmPathMode: process.env.LLM_PATH_MODE || "direct-provider",
  });
});

// Demo reset. Wipes audit rows and re-seeds canonical scenarios so a demo
// always starts from the same shape:
//   - one ALLOWED, one MASKED, one BLOCKED-PII, one BLOCKED-keyword,
//   - one COMPLEX (large model), one BLOCKED-budget, plus historical rows.
//
// Gated on ALLOW_DEMO_RESET=true so this can never be triggered in a real
// environment by accident. Refuses to run if the flag isn't on.
adminRouter.post("/demo-reset", (req: Request, res: Response) => {
  if (!config.allowDemoReset) {
    res.status(403).json({
      error: "demo_reset_disabled",
      message: "Set ALLOW_DEMO_RESET=true in .env to enable this endpoint locally.",
    });
    return;
  }
  // Only allow loopback callers when enabled, to make accidental misuse
  // even harder. (In a Docker setup you may need to relax this.)
  const remote = req.ip || "";
  const isLoopback =
    remote.endsWith("127.0.0.1") || remote === "::1" || remote === "::ffff:127.0.0.1";
  if (!isLoopback && remote !== "" && process.env.DEMO_RESET_ALLOW_REMOTE !== "true") {
    res.status(403).json({
      error: "demo_reset_loopback_only",
      message: "Demo reset is restricted to loopback. Set DEMO_RESET_ALLOW_REMOTE=true to override locally.",
      remote,
    });
    return;
  }
  const { rowsAfter } = resetDemoData(db);
  res.json({
    ok: true,
    rowsAfter,
    message: `Audit log cleared and re-seeded with ${rowsAfter} canonical scenarios.`,
  });
});
