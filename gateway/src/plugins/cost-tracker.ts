import type { BlockResult, BudgetStatus, ModelTier } from "../types.js";
import { db } from "../services/logger.js";

interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

const PRICING: Readonly<Record<ModelTier, ModelPricing>> = {
  small: { inputPer1k: 0.0005, outputPer1k: 0.001 },
  large: { inputPer1k: 0.005, outputPer1k: 0.015 },
};

const TEAM_BUDGETS: Readonly<Record<string, number>> = {
  "Compressor Technique": 150.0,
  "Vacuum Technique": 200.0,
  "Power Technique": 100.0,
  "Industrial Technique": 120.0,
  "Customer Service": 200.0,
};

const PRECISION = 1_000_000;

const spendQuery = db.prepare(`
  SELECT COALESCE(SUM(cost_usd), 0) AS spent
  FROM request_logs
  WHERE team = ?
    AND timestamp >= datetime('now', 'start of month')
`);

export function calculateCost(
  model: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  const prices = PRICING[model] ?? PRICING.small;
  const cost =
    (inputTokens / 1000) * prices.inputPer1k +
    (outputTokens / 1000) * prices.outputPer1k;
  return Math.round(cost * PRECISION) / PRECISION;
}

function getMonthlySpend(team: string): number {
  const row = spendQuery.get(team) as { spent: number } | undefined;
  return row?.spent ?? 0;
}

export function checkBudget(team: string): BlockResult | null {
  const limit = TEAM_BUDGETS[team];
  if (limit === undefined) return null;

  const spent = getMonthlySpend(team);
  if (spent >= limit) {
    return {
      reason: "budget_exceeded",
      details: [team],
      message: `Team '${team}' has exceeded monthly budget ($${spent.toFixed(2)} / $${limit.toFixed(2)})`,
    };
  }

  return null;
}

export function recordSpend(_team: string, _cost: number): void {
  // No-op: spend is now computed from the database.
  // The logRequest call in chat.ts writes cost_usd to request_logs,
  // and getMonthlySpend reads it back. No in-memory tracking needed.
}

export function getAllBudgets(): BudgetStatus[] {
  return Object.entries(TEAM_BUDGETS).map(([team, limit]) => {
    const spent = getMonthlySpend(team);
    return {
      team,
      spent,
      limit,
      percentage: Math.round((spent / limit) * 100),
    };
  });
}
