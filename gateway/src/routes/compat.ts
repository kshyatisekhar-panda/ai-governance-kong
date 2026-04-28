import { Router } from "express";
import type { Request, Response } from "express";
import { scanAndProcess } from "../plugins/pii-blocker.js";
import { calculateCost, checkBudget, recordSpend } from "../plugins/cost-tracker.js";
import { classifyPrompt } from "../plugins/smart-router.js";
import { getAppPolicy } from "../plugins/app-policy.js";
import { detectAPI } from "../plugins/api-detector.js";
import { forwardToLLM, resolveModelName } from "../services/llm-client.js";
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
    logs: logs.map((l: any) => ({
      requestId: `req-${l.id}`,
      timestamp: l.timestamp,
      sourceApp: l.app,
      team: l.team,
      endpoint: "/ai/chat",
      decision: l.status === "blocked" ? "BLOCKED" : l.status === "masked" ? "MASKED" : "ALLOWED",
      policy: "AI_GOVERNANCE",
      blockReason: l.block_reason || null,
      model: l.model,
      modelRouteReason: /70b|opus|claude|gpt-4|qwen.*235/i.test(l.model || "") ? "complex prompt" : "simple prompt",
      piiDetected: l.block_reason ? true : false,
      piiTypes: l.block_reason ? l.block_reason.split(",") : [],
      piiAction: l.status === "masked" ? "REDACT" : l.status === "blocked" ? "BLOCK" : "NONE",
      sensitivePiiDetected: l.status === "blocked" && l.block_reason !== "blocked_keyword",
      budgetStatus: "BUDGET_OK",
      estimatedCostUsd: l.cost_usd,
      latencyMs: l.latency_ms,
      auditLogged: true,
      safePromptPreview: `[${l.prompt_length} chars]`,
      redactedInputPreview: `[${l.prompt_length} chars]`,
      responseSummary: l.status === "passed" || l.status === "masked" ? "Response delivered" : "Request blocked",
    })),
  });
});

// Customer chat (their format)
compatRouter.post("/customer-chat", async (req: Request, res: Response) => {
  try {
  const { message, team = "engineering", sourceApp = "customer-chat" } = req.body;

  const policy = getAppPolicy(sourceApp);
  const piiResult = scanAndProcess(message, policy.pii);

  if (piiResult.decision === "blocked") {
    await logRequest({
      team, app: sourceApp, model: "", promptLength: message.length,
      inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0,
      status: "blocked", blockReason: piiResult.piiFound.join(","),
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

  // Prompt length check
  if (message.length > policy.model.maxPromptLength) {
    await logRequest({
      team, app: sourceApp, model: "", promptLength: message.length,
      inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0,
      status: "blocked", blockReason: "prompt_too_long",
    });
    res.status(403).json({
      reply: null,
      governance: {
        requestId: `req-${Date.now()}`,
        decision: "BLOCKED",
        blockReason: `Prompt too long for ${sourceApp}. Max ${policy.model.maxPromptLength} chars, got ${message.length}.`,
        model: null,
        estimatedCostUsd: 0,
        latencyMs: 0,
      },
    });
    return;
  }

  const safeText = piiResult.safeText;
  const wasMasked = piiResult.decision === "masked";
  let model: ModelTier = classifyPrompt(safeText);

  // Enforce model access per policy
  if (model === "large" && !policy.model.allowLarge) model = "small";
  if (model === "small" && !policy.model.allowSmall) model = "large";

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
  const modelName = resolveModelName(model);

  const { prompt_tokens: inputTokens, completion_tokens: outputTokens } = result.usage;
  const cost = calculateCost(model, inputTokens, outputTokens);
  recordSpend(team, cost);

  await logRequest({
    team, app: sourceApp, model: modelName, promptLength: message.length,
    inputTokens, outputTokens, costUsd: cost, latencyMs,
    status: wasMasked ? "masked" : "passed",
    blockReason: wasMasked ? piiResult.maskedTypes.join(",") : "",
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
      model: modelName,
      modelRouteReason: model === "large" ? "complex prompt" : "simple prompt",
      estimatedCostUsd: cost,
      budgetStatus: "BUDGET_OK",
      latencyMs,
      auditLogged: true,
      safePromptPreview: safeText.slice(0, 120),
      dataSource: detected?.name ?? null,
    },
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[customer-chat] error:", message);
    res.status(500).json({ error: "Customer chat failed", details: message });
  }
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
  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[products/ask] error:", message);
    res.status(500).json({ error: "Product Q&A failed", details: message });
  }
});

// Service cases are handled by routes/service-cases.ts (mounted at /api/service-cases)
