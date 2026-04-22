import type { BlockResult, BudgetStatus, ModelTier } from "../types.js";

interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

const PRICING: Readonly<Record<ModelTier, ModelPricing>> = {
  small: { inputPer1k: 0.0005, outputPer1k: 0.001 },
  large: { inputPer1k: 0.005, outputPer1k: 0.015 },
};

const TEAM_BUDGETS: Readonly<Record<string, number>> = {
  engineering: 100.0,
  "data-science": 200.0,
  marketing: 50.0,
};

const PRECISION = 1_000_000;

// In-memory spend tracking (resets on restart, fine for PoC)
const teamSpend = new Map<string, number>();

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

export function checkBudget(team: string): BlockResult | null {
  const limit = TEAM_BUDGETS[team];
  if (limit === undefined) return null;

  const spent = teamSpend.get(team) ?? 0;
  if (spent >= limit) {
    return {
      reason: "budget_exceeded",
      details: [team],
      message: `Team '${team}' has exceeded monthly budget ($${spent.toFixed(2)} / $${limit.toFixed(2)})`,
    };
  }

  return null;
}

export function recordSpend(team: string, cost: number): void {
  teamSpend.set(team, (teamSpend.get(team) ?? 0) + cost);
}

export function getAllBudgets(): BudgetStatus[] {
  return Object.entries(TEAM_BUDGETS).map(([team, limit]) => {
    const spent = teamSpend.get(team) ?? 0;
    return {
      team,
      spent,
      limit,
      percentage: Math.round((spent / limit) * 100),
    };
  });
}
