import { Router } from "express";
import type { Request, Response } from "express";
import { scanAndProcess } from "../plugins/pii-blocker.js";
import { calculateCost, checkBudget, recordSpend } from "../plugins/cost-tracker.js";
import { classifyPrompt } from "../plugins/smart-router.js";
import { detectAPI } from "../plugins/api-detector.js";
import { forwardToLLM } from "../services/llm-client.js";
import {
  logRequest,
  getRecentLogs,
  getFilteredLogs,
  getOverallStats,
  getStatsByTeam,
  getStatsByApp,
  getMaskedCount,
  getDecisionsOverTime,
} from "../services/logger.js";
import { getSalesData, getFilterOptions, getInventoryStatus } from "../services/business-apis.js";
import type { ChatMessage, ModelTier } from "../types.js";

export const compatRouter = Router();

// Governance stats (their format)
compatRouter.get("/governance/stats", async (_req, res) => {
  const stats = (await getOverallStats()) as any;
  const byTeam = (await getStatsByTeam()) as any[];
  const byApp = (await getStatsByApp()) as any[];
  const masked = await getMaskedCount();
  const decisionsOverTime = (await getDecisionsOverTime()) as any[];

  res.json({
    totalRequests: stats.total_requests,
    allowedRequests: stats.passed_requests - masked,
    maskedRequests: masked,
    blockedRequests: stats.blocked_requests,
    piiEvents: stats.blocked_requests + masked,
    costToday: stats.total_cost,
    budgetRemaining: 300,
    averageLatencyMs: Math.round(stats.avg_latency),
    usageByTeam: byTeam.map((t: any) => ({
      team: t.team,
      requests: t.total_requests,
      cost: t.total_cost,
    })),
    requestsBySourceApp: byApp.map((a: any) => ({
      sourceApp: a.app,
      requests: a.total_requests,
    })),
    decisionsOverTime: decisionsOverTime.map((r: any) => ({
      hour: r.hour,
      allowed: r.allowed,
      masked: r.masked,
      blocked: r.blocked,
    })),
  });
});

// Governance logs (their format)
compatRouter.get("/governance/logs", async (req, res) => {
  const logs = getFilteredLogs({
    decision: req.query.decision as string,
    sourceApp: req.query.sourceApp as string,
    team: req.query.team as string,
    piiType: req.query.piiType as string,
    limit: parseInt(req.query.limit as string) || 50,
  }) as any[];

  res.json({
    logs: logs.map((l: any) => {
      const status: string = l.status;
      const blocked = status === "blocked";
      const masked = status === "masked";
      // Inferred decision layer for legacy rows: kong layer can only block
      // when the prompt-guard pattern hits, which produces a `blocked` status
      // without ever reaching Express (so older rows of those will be missing
      // here entirely). For everything in this table, the decision was made
      // in Express or further down the chain.
      const decisionLayer: string =
        l.decision_layer ||
        (blocked ? "express" : masked ? "express" : "llm");
      return {
        requestId: `req-${l.id}`,
        timestamp: l.timestamp,
        sourceApp: l.app,
        team: l.team,
        endpoint: l.kong_route || "/ai/chat",
        decision: blocked ? "BLOCKED" : masked ? "MASKED" : "ALLOWED",
        policy: l.policy_applied || "AI_GOVERNANCE",
        blockReason: l.block_reason || null,
        model: l.model,
        modelRouteReason: l.model === "large" ? "complex prompt" : "simple prompt",
        piiDetected: l.block_reason ? true : false,
        piiTypes: l.block_reason ? String(l.block_reason).split(",") : [],
        piiAction: masked ? "REDACT" : blocked ? "BLOCK" : "NONE",
        sensitivePiiDetected: blocked && l.block_reason !== "blocked_keyword",
        budgetStatus: l.block_reason === "budget_exceeded" ? "BUDGET_EXCEEDED" : "BUDGET_OK",
        estimatedCostUsd: l.cost_usd,
        latencyMs: l.latency_ms,
        auditLogged: true,
        safePromptPreview: `[${l.prompt_length} chars]`,
        redactedInputPreview: `[${l.prompt_length} chars]`,
        responseSummary: status === "passed" || status === "masked" ? "Response delivered" : "Request blocked",
        // Lifecycle / evidence fields (defaults preserve compatibility)
        lifecycle: {
          decisionLayer,
          llmCalled: !!l.llm_called || (status !== "blocked"),
          llmPathMode: l.llm_path_mode || "direct-provider",
          kongRoute: l.kong_route || "/ai/chat",
          kongProcessed: l.kong_processed || "unknown",
          dataSource: l.data_source || null,
          piiMaskedTypes: l.pii_masked_types ? String(l.pii_masked_types).split(",").filter(Boolean) : [],
          policyApplied: l.policy_applied || `app:${l.app}`,
          // Plugins configured at the Kong layer for this route. Note: the
          // app cannot directly observe whether each plugin executed — these
          // are "expected from Kong config".
          kongPluginsExpected: kongPluginsExpectedForRoute(l.kong_route || "/ai/chat"),
        },
      };
    }),
  });
});

function kongPluginsExpectedForRoute(route: string): string[] {
  if (route === "/ai/chat" || route.startsWith("/ai/chat/")) {
    return [
      "key-auth", "rate-limiting", "cors", "request-size-limiting",
      "bot-detection", "response-transformer", "ai-prompt-guard",
    ];
  }
  return [
    "key-auth", "rate-limiting", "cors", "request-size-limiting",
    "bot-detection", "response-transformer",
  ];
}

// Customer chat (their format)
compatRouter.post("/customer-chat", async (req: Request, res: Response) => {
  const { message, team = "engineering", sourceApp = "customer-chat" } = req.body;

  const piiResult = scanAndProcess(message);

  if (piiResult.decision === "blocked") {
    await logRequest({
      team, app: sourceApp, model: "", promptLength: message.length,
      inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0,
      status: "blocked", blockReason: piiResult.piiFound.join(","),
      decisionLayer: "express", kongRoute: "/api/customer-chat",
      kongProcessed: "unknown", llmCalled: false,
      llmPathMode: "direct-provider", policyApplied: `app:${sourceApp}`,
    });

    res.status(403).json({
      reply: null,
      governance: {
        requestId: `req-${Date.now()}`,
        decision: "BLOCKED",
        piiDetected: true,
        piiTypes: piiResult.blockedTypes,
        piiAction: "BLOCK",
        sensitivePiiDetected: true,
        blockReason: piiResult.message,
        model: null,
        estimatedCostUsd: 0,
        budgetStatus: "BUDGET_OK",
        latencyMs: 0,
      },
    });
    return;
  }

  const safeText = piiResult.safeText;
  const wasMasked = piiResult.decision === "masked";
  const model: ModelTier = classifyPrompt(safeText);

  const detected = detectAPI(safeText);
  let messages: ChatMessage[] = [{ role: "user", content: safeText }];

  if (detected) {
    messages = [
      { role: "system", content: `${detected.systemPrompt}\n\nData:\n${JSON.stringify(detected.data, null, 2)}` },
      ...messages,
    ];
  }

  const budgetBlock = checkBudget(team);
  if (budgetBlock) {
    res.status(403).json({
      reply: null,
      governance: {
        requestId: `req-${Date.now()}`,
        decision: "BLOCKED",
        blockReason: "BUDGET_EXCEEDED",
        budgetStatus: "BUDGET_EXCEEDED",
        model: null,
        estimatedCostUsd: 0,
        latencyMs: 0,
      },
    });
    return;
  }

  const start = Date.now();
  const result = await forwardToLLM(messages, model);
  const latencyMs = Date.now() - start;

  const { prompt_tokens: inputTokens, completion_tokens: outputTokens } = result.usage;
  const cost = calculateCost(model, inputTokens, outputTokens);
  recordSpend(team, cost);

  await logRequest({
    team, app: sourceApp, model, promptLength: message.length,
    inputTokens, outputTokens, costUsd: cost, latencyMs,
    status: wasMasked ? "masked" : "passed",
    blockReason: wasMasked ? piiResult.maskedTypes.join(",") : "",
    decisionLayer: "llm", kongRoute: "/api/customer-chat",
    kongProcessed: "unknown", llmCalled: true,
    llmPathMode: "direct-provider",
    dataSource: detected?.name ?? "",
    piiMaskedTypes: wasMasked ? piiResult.maskedTypes.join(",") : "",
    policyApplied: `app:${sourceApp}`,
  });

  res.json({
    reply: result.choices[0]?.message?.content ?? "",
    governance: {
      requestId: `req-${Date.now()}`,
      decision: wasMasked ? "MASKED" : "ALLOWED",
      piiDetected: wasMasked,
      piiTypes: piiResult.maskedTypes,
      piiAction: wasMasked ? "REDACT" : "NONE",
      sensitivePiiDetected: false,
      model,
      modelRouteReason: model === "large" ? "complex prompt" : "simple prompt",
      estimatedCostUsd: cost,
      budgetStatus: "BUDGET_OK",
      latencyMs,
      auditLogged: true,
      safePromptPreview: safeText.slice(0, 120),
      dataSource: detected?.name ?? null,
    },
  });
});

// Products (map to our sales data)
compatRouter.get("/products", (req, res) => {
  const { region, businessArea } = req.query as Record<string, string>;
  const data = getSalesData({ region, businessArea });

  const productMap = new Map<string, any>();
  for (const r of data) {
    if (!productMap.has(r.product)) {
      productMap.set(r.product, {
        id: r.product.replace(/\s+/g, "-").toLowerCase(),
        name: r.product,
        category: r.category,
        businessArea: r.businessArea,
        brand: r.brand,
        totalUnitsSold: 0,
        totalRevenue: 0,
        regions: new Set(),
      });
    }
    const p = productMap.get(r.product)!;
    p.totalUnitsSold += r.unitsSold;
    p.totalRevenue += r.revenue;
    p.regions.add(r.region);
  }

  const products = [...productMap.values()].map((p) => ({
    ...p,
    regions: [...p.regions],
  }));

  res.json(products);
});

// Products ask (AI question about products)
compatRouter.post("/products/ask", async (req: Request, res: Response) => {
  const { question, filters } = req.body;
  const data = getSalesData(filters);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are an Atlas Copco product specialist. Use this data to answer:\n${JSON.stringify(data.slice(0, 30), null, 2)}`,
    },
    { role: "user", content: question },
  ];

  const model: ModelTier = classifyPrompt(question);
  const result = await forwardToLLM(messages, model);

  const { prompt_tokens: inputTokens, completion_tokens: outputTokens } = result.usage;
  const cost = calculateCost(model, inputTokens, outputTokens);

  res.json({
    answer: result.choices[0]?.message?.content ?? "",
    governance: {
      decision: "ALLOWED",
      policy: "GENERAL_BUSINESS_DATA",
      model,
      estimatedCostUsd: cost,
    },
  });
});

// Service cases (basic stub)
const serviceCases: any[] = [];

compatRouter.get("/service-cases", (_req, res) => {
  res.json(serviceCases);
});

compatRouter.post("/service-cases", (req, res) => {
  const newCase = {
    id: `case-${Date.now()}`,
    ...req.body,
    status: "open",
    priority: "medium",
    createdAt: new Date().toISOString(),
  };
  serviceCases.push(newCase);
  res.json({ case: newCase, triage: null });
});

compatRouter.get("/service-cases/:id", (req, res) => {
  const found = serviceCases.find((c) => c.id === req.params.id);
  if (!found) return res.status(404).json({ error: "Case not found" });
  res.json(found);
});
