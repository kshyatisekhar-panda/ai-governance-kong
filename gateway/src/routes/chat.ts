import { Router } from "express";
import type { Request, Response } from "express";
import { checkRequest } from "../plugins/pii-blocker.js";
import { calculateCost, checkBudget, recordSpend } from "../plugins/cost-tracker.js";
import { classifyPrompt } from "../plugins/smart-router.js";
import { detectAPI } from "../plugins/api-detector.js";
import { forwardToLLM } from "../services/llm-client.js";
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
  const start = Date.now();
  const { team, app } = req.client!;
  const { messages, model: requestedModel } = req.body as {
    messages: ChatMessage[];
    model?: ModelTier;
  };

  const promptText = extractPromptText(messages);

  // Plugin 1: PII / Content Blocker
  const block = checkRequest(promptText);
  if (block) {
    await logRequest(
      buildLogEntry({
        team,
        app,
        promptLength: promptText.length,
        latencyMs: Date.now() - start,
        status: "blocked",
        blockReason: block.reason,
      }),
    );
    res.status(451).json({ error: block.reason, message: block.message });
    return;
  }

  // Plugin 2: Budget Enforcement
  const budgetBlock = checkBudget(team);
  if (budgetBlock) {
    await logRequest(
      buildLogEntry({
        team,
        app,
        promptLength: promptText.length,
        latencyMs: Date.now() - start,
        status: "blocked",
        blockReason: budgetBlock.reason,
      }),
    );
    res.status(429).json({ error: budgetBlock.reason, message: budgetBlock.message });
    return;
  }

  // Plugin 3: Smart Model Router
  const model: ModelTier = requestedModel ?? classifyPrompt(promptText);

  // Plugin 4: API Detector (enrich prompt with business data)
  const detected = detectAPI(promptText);
  let enrichedMessages: ChatMessage[] = [...messages];
  let dataSource: string | null = null;

  if (detected) {
    dataSource = detected.name;
    enrichedMessages = [
      {
        role: "system",
        content: `${detected.systemPrompt}\n\nData:\n${JSON.stringify(detected.data, null, 2)}`,
      },
      ...messages,
    ];
  }

  // Forward to LLM
  const result = await forwardToLLM(enrichedMessages, model);
  const latencyMs = Date.now() - start;

  // Plugin 5: Cost Tracking
  const { prompt_tokens: inputTokens, completion_tokens: outputTokens } =
    result.usage;
  const cost = calculateCost(model, inputTokens, outputTokens);
  recordSpend(team, cost);

  // Plugin 6: Audit Logger
  await logRequest(
    buildLogEntry({
      team,
      app,
      model,
      promptLength: promptText.length,
      inputTokens,
      outputTokens,
      costUsd: cost,
      latencyMs,
      status: "passed",
    }),
  );

  res.json({
    ...result,
    gateway: {
      team,
      app,
      model_routed: model,
      cost_usd: cost,
      latency_ms: latencyMs,
      data_source: dataSource,
    },
  });
});
