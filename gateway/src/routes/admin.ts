import express, { Router } from "express";
import { getAllBudgets } from "../plugins/cost-tracker.js";
import { getAllPolicies } from "../plugins/app-policy.js";
import {
  getRecentLogs,
  getOverallStats,
  getStatsByTeam,
  getStatsByModel,
  getTodayStatsByTeam,
  logSocEvent,
  getSocEvents,
  clearAllLogs,
  logRequest
} from "../services/logger.js";
import type { SocEvent } from "../types.js";

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

adminRouter.post("/kong-events", async (req, res) => {
  if (req.headers["x-kong-internal-secret"] !== "kong_secret") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const event = req.body as SocEvent;
  if (event && event.eventId) {
    await logSocEvent(event);
  }
  res.status(202).json({ status: "accepted" });
});

adminRouter.get("/soc-events", async (_req, res) => {
  const events = await getSocEvents();
  res.json({ events });
});

adminRouter.post("/demo-reset", async (_req, res) => {
  await clearAllLogs();
  
  // Seed safe synthetic demo rows
  const now = new Date();
  
  const ev1: SocEvent = {
    eventId: "soc_demo1", timestamp: now.toISOString(), layer: "Kong Prompt Shield",
    decision: "ALLOWED", blockReason: "", method: "POST", path: "/ai/chat",
    clientIp: "127.0.0.1", consumer: "customer-service", routeName: "ai-chat",
    model: "openai/gpt-4o-mini", llmCalled: true,
    datapoints: { clientIp: "observed", consumer: "observed", method: "observed", path: "observed", rawBody: "observed-redacted", route: "observed" }
  };
  await logSocEvent(ev1);
  await logRequest({ team: "customer-service", app: "customer-chat", model: "openai/gpt-4o-mini", promptLength: 120, inputTokens: 40, outputTokens: 50, costUsd: 0.0001, latencyMs: 340, status: "passed", blockReason: "" });

  const ev2: SocEvent = {
    eventId: "soc_demo2", timestamp: new Date(now.getTime() - 1000).toISOString(), layer: "Kong Prompt Shield",
    decision: "BLOCKED", blockReason: "BLOCKED_SENSITIVE_IDENTIFIER", method: "POST", path: "/ai/chat",
    clientIp: "127.0.0.1", consumer: "customer-service", routeName: "ai-chat",
    model: "openai/gpt-4o-mini", llmCalled: false,
    datapoints: { clientIp: "observed", consumer: "observed", method: "observed", path: "observed", rawBody: "observed-redacted", route: "observed" }
  };
  await logSocEvent(ev2);

  const ev3: SocEvent = {
    eventId: "soc_demo3", timestamp: new Date(now.getTime() - 2000).toISOString(), layer: "Kong Prompt Shield",
    decision: "BLOCKED", blockReason: "BLOCKED_PROMPT_INJECTION", method: "POST", path: "/ai/chat",
    clientIp: "127.0.0.1", consumer: "marketing", routeName: "ai-chat",
    model: "openai/gpt-4o-mini", llmCalled: false,
    datapoints: { clientIp: "observed", consumer: "observed", method: "observed", path: "observed", rawBody: "observed-redacted", route: "observed" }
  };
  await logSocEvent(ev3);

  const ev4: SocEvent = {
    eventId: "soc_demo4", timestamp: new Date(now.getTime() - 3000).toISOString(), layer: "Kong Prompt Shield",
    decision: "ALLOWED", blockReason: "", method: "POST", path: "/ai/chat",
    clientIp: "127.0.0.1", consumer: "engineering", routeName: "ai-chat",
    model: "openai/gpt-4o", llmCalled: true,
    datapoints: { clientIp: "observed", consumer: "observed", method: "observed", path: "observed", rawBody: "observed-redacted", route: "observed" }
  };
  await logSocEvent(ev4);
  await logRequest({ team: "engineering", app: "dev-assistant", model: "openai/gpt-4o", promptLength: 450, inputTokens: 120, outputTokens: 80, costUsd: 0.001, latencyMs: 1200, status: "masked", blockReason: "email" });

  res.json({ message: "Demo reset successful" });
});
