import { Router } from "express";
import type { Request, Response } from "express";
import { scanAndProcess } from "../plugins/pii-blocker.js";
import { calculateCost, checkBudget, recordSpend } from "../plugins/cost-tracker.js";
import { classifyPrompt } from "../plugins/smart-router.js";
import { detectAPI } from "../plugins/api-detector.js";
import { getAppPolicy } from "../plugins/app-policy.js";
import { forwardToLLM, resolveModelName } from "../services/llm-client.js";
import { logRequest } from "../services/logger.js";
import { authMiddleware } from "../middleware/auth.js";
import type { ChatMessage, ModelTier, RequestLogEntry } from "../types.js";

export const chatRouter = Router();

chatRouter.use(authMiddleware);

function extractPromptText(messages: ChatMessage[]): string {
  return messages.map((m) => m.content ?? "").join(" ");
}

function buildLogEntry(
  overrides: Partial<RequestLogEntry> & Pick<RequestLogEntry, "team" | "app" | "status">,
): RequestLogEntry {
  return {
    model: "",
    promptLength: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: 0,
    blockReason: "",
    ...overrides,
  };
}

chatRouter.post("/", async (req: Request, res: Response) => {
  try {
    await handleChat(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[chat] error:", message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Chat request failed", details: message });
    }
  }
});

async function handleChat(req: Request, res: Response): Promise<void> {
  const start = Date.now();
  const { team, app } = req.client!;
  const { messages, model: requestedModel } = req.body as {
    messages: ChatMessage[];
    model?: ModelTier;
  };

  const promptText = extractPromptText(messages);
  const policy = getAppPolicy(app);

  // Plugin 1: Prompt length check
  if (promptText.length > policy.model.maxPromptLength) {
    await logRequest(
      buildLogEntry({
        team, app, promptLength: promptText.length,
        latencyMs: Date.now() - start,
        status: "blocked", blockReason: "prompt_too_long",
      }),
    );
    res.status(413).json({
      error: "prompt_too_long",
      message: `Prompt too long for ${app}. Max ${policy.model.maxPromptLength} characters, got ${promptText.length}.`,
    });
    return;
  }

  // Plugin 2: PII Scanner (uses app-specific policy)
  const piiResult = scanAndProcess(promptText, policy.pii);

  if (piiResult.decision === "blocked") {
    await logRequest(
      buildLogEntry({
        team, app, promptLength: promptText.length,
        latencyMs: Date.now() - start,
        status: "blocked", blockReason: piiResult.piiFound.join(","),
      }),
    );
    res.status(451).json({
      error: "pii_detected",
      message: piiResult.message,
      pii_types: piiResult.blockedTypes,
      policy: piiResult.policyApplied,
    });
    return;
  }

  const safeText = piiResult.safeText;
  const wasMasked = piiResult.decision === "masked";
  const safeMessages: ChatMessage[] = messages.map((m) =>
    m.role === "user" ? { ...m, content: safeText } : m,
  );

  // Plugin 3: Budget Enforcement
  const budgetBlock = checkBudget(team);
  if (budgetBlock) {
    await logRequest(
      buildLogEntry({
        team, app, promptLength: promptText.length,
        latencyMs: Date.now() - start,
        status: "blocked", blockReason: "budget_exceeded",
      }),
    );
    res.status(429).json({ error: budgetBlock.reason, message: budgetBlock.message });
    return;
  }

  // Plugin 4: Smart Model Router (respects app policy)
  let model: ModelTier = requestedModel ?? classifyPrompt(safeText);

  // Enforce model access rules
  if (model === "large" && !policy.model.allowLarge) {
    model = "small";
  }
  if (model === "small" && !policy.model.allowSmall) {
    model = "large";
  }

  // Plugin 5: API Detector (enrich prompt with business data)
  const detected = detectAPI(safeText);
  let enrichedMessages: ChatMessage[] = [...safeMessages];
  let dataSource: string | null = null;

  if (detected) {
    dataSource = detected.name;
    enrichedMessages = [
      {
        role: "system",
        content: `${detected.systemPrompt}\n\nData:\n${JSON.stringify(detected.data, null, 2)}`,
      },
      ...safeMessages,
    ];
  }

  // Forward to LLM
  const result = await forwardToLLM(enrichedMessages, model);
  const latencyMs = Date.now() - start;
  const modelName = resolveModelName(model);

  // Plugin 6: Cost Tracking
  const { prompt_tokens: inputTokens, completion_tokens: outputTokens } = result.usage;
  const cost = calculateCost(model, inputTokens, outputTokens);
  recordSpend(team, cost);

  // Plugin 7: Audit Logger
  await logRequest(
    buildLogEntry({
      team, app, model: modelName, promptLength: promptText.length,
      inputTokens, outputTokens, costUsd: cost, latencyMs,
      status: wasMasked ? "masked" : "passed",
      blockReason: wasMasked ? piiResult.maskedTypes.join(",") : "",
    }),
  );

  res.json({
    ...result,
    gateway: {
      team,
      app,
      model_routed: modelName,
      cost_usd: cost,
      latency_ms: latencyMs,
      data_source: dataSource,
      pii_masked: wasMasked,
      masked_types: piiResult.maskedTypes,
      policy: {
        maxPromptLength: policy.model.maxPromptLength,
        allowLargeModel: policy.model.allowLarge,
        piiMaskingEnabled: policy.pii.allowMasking,
      },
    },
  });
}
