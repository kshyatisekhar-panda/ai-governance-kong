import express, { Router } from "express";
import { getAllBudgets } from "../plugins/cost-tracker.js";
import { getAllPolicies } from "../plugins/app-policy.js";
import {
  getRecentLogs,
  getOverallStats,
  getStatsByTeam,
  getStatsByModel,
  getTodayStatsByTeam,
  logRequest,
} from "../services/logger.js";
import { API_KEYS } from "../config.js";
import type { RequestStatus } from "../types.js";

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

// Kong HTTP-log receiver: log Kong-level events (auth fail, rate limit,
// ai-prompt-guard block) into the same audit table. We only record events
// the gateway never sees (4xx from Kong's plugins) to avoid duplicates with
// the gateway's own logs for successful requests.
adminRouter.post("/kong-log", express.json({ limit: "1mb" }), (req, res) => {
  try {
    const payload = req.body as any;
    const status: number = payload?.response?.status ?? 0;

    // Skip 2xx/3xx — gateway already logged the success path
    if (status < 400) {
      res.status(204).end();
      return;
    }

    const apiKey: string =
      payload?.request?.headers?.["x-api-key"] ?? "(unknown)";
    const identity = API_KEYS[apiKey] ?? { team: "unknown", app: "unknown" };
    const path: string = payload?.request?.uri ?? "/";
    const latencyMs: number = payload?.latencies?.request ?? 0;

    let blockReason = "kong_rejected";
    let logStatus: RequestStatus = "blocked";
    if (status === 401 || status === 403) blockReason = "auth_failed";
    else if (status === 429) blockReason = "rate_limited";
    else if (status === 400) blockReason = "kong_validation";
    else if (status === 413) blockReason = "payload_too_large";

    // Detect ai-prompt-guard hit (Kong returns 400 with a specific message)
    const errMsg: string = payload?.response?.headers?.["x-kong-response-latency"] ? "" : "";
    if (errMsg.includes("prompt") || errMsg.includes("Prompt")) {
      blockReason = "kong_ai_prompt_guard";
    }

    logRequest({
      team: identity.team,
      app: `kong:${identity.app}`,
      model: "",
      promptLength: payload?.request?.size ? Number(payload.request.size) : 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs,
      status: logStatus,
      blockReason,
      endpoint: path,
    });
    res.status(204).end();
  } catch (err) {
    console.error("[kong-log] failed to record:", err);
    res.status(204).end();
  }
});
