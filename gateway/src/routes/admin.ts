import { Router } from "express";
import { getAllBudgets } from "../plugins/cost-tracker.js";
import { getAllPolicies } from "../plugins/app-policy.js";
import {
  getRecentLogs,
  getOverallStats,
  getStatsByTeam,
  getStatsByModel,
  getTodayStatsByTeam,
} from "../services/logger.js";

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
