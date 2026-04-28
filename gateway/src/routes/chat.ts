import { Router } from "express";
import type { Request, Response } from "express";
import { scanAndProcess } from "../plugins/pii-blocker.js";
import { calculateCost, checkBudget, recordSpend } from "../plugins/cost-tracker.js";
import { classifyPrompt } from "../plugins/smart-router.js";
import { detectAPI } from "../plugins/api-detector.js";
import { getAppPolicy } from "../plugins/app-policy.js";
import { buildKongEvidence } from "../plugins/kong-evidence.js";
import { forwardToLLM, getLlmPathMode } from "../services/llm-client.js";
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
    decisionLayer: "",
    kongRoute: "/ai/chat",
    kongProcessed: "unknown",
    llmCalled: false,
    llmPathMode: getLlmPathMode(),
    dataSource: "",
    piiMaskedTypes: "",
    policyApplied: "",
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

  const kongEvidence = buildKongEvidence(req, "/ai/chat");
  const llmPathMode = getLlmPathMode();
  const promptText = extractPromptText(messages);
  const policy = getAppPolicy(app);
  const policyApplied = `app:${app}`;

  // Plugin 1: Prompt length check (App governance layer)
  if (promptText.length > policy.model.maxPromptLength) {
    await logRequest(
      buildLogEntry({
        team, app, promptLength: promptText.length,
        latencyMs: Date.now() - start,
        status: "blocked", blockReason: "prompt_too_long",
        decisionLayer: "express",
        kongProcessed: kongEvidence.processedByKong,
        llmCalled: false,
        llmPathMode,
        policyApplied,
      }),
    );
    res.status(413).json({
      error: "prompt_too_long",
      message: `Prompt too long for ${app}. Max ${policy.model.maxPromptLength} characters, got ${promptText.length}.`,
      lifecycle: lifecycleResponse({
        decisionLayer: "express",
        decisionDetail: "App governance: prompt exceeded app policy max length",
        llmCalled: false,
        llmPathMode,
        kongEvidence,
        policyApplied,
      }),
    });
    return;
  }

  // Plugin 2: PII Scanner (App governance layer)
  const piiResult = scanAndProcess(promptText, policy.pii);

  if (piiResult.decision === "blocked") {
    await logRequest(
      buildLogEntry({
        team, app, promptLength: promptText.length,
        latencyMs: Date.now() - start,
        status: "blocked", blockReason: piiResult.piiFound.join(","),
        decisionLayer: "express",
        kongProcessed: kongEvidence.processedByKong,
        llmCalled: false,
        llmPathMode,
        policyApplied,
      }),
    );
    res.status(451).json({
      error: "pii_detected",
      message: piiResult.message,
      pii_types: piiResult.blockedTypes,
      policy: piiResult.policyApplied,
      lifecycle: lifecycleResponse({
        decisionLayer: "express",
        decisionDetail: "App governance: PII blocker rejected the prompt",
        llmCalled: false,
        llmPathMode,
        kongEvidence,
        policyApplied,
        blockedTypes: piiResult.blockedTypes,
      }),
    });
    return;
  }

  const safeText = piiResult.safeText;
  const wasMasked = piiResult.decision === "masked";
  const safeMessages: ChatMessage[] = messages.map((m) =>
    m.role === "user" ? { ...m, content: safeText } : m,
  );

  // Plugin 3: Budget Enforcement (App governance layer)
  const budgetBlock = checkBudget(team);
  if (budgetBlock) {
    await logRequest(
      buildLogEntry({
        team, app, promptLength: promptText.length,
        latencyMs: Date.now() - start,
        status: "blocked", blockReason: "budget_exceeded",
        decisionLayer: "express",
        kongProcessed: kongEvidence.processedByKong,
        llmCalled: false,
        llmPathMode,
        policyApplied,
      }),
    );
    res.status(429).json({
      error: budgetBlock.reason,
      message: budgetBlock.message,
      lifecycle: lifecycleResponse({
        decisionLayer: "express",
        decisionDetail: "App governance: team monthly budget exceeded",
        llmCalled: false,
        llmPathMode,
        kongEvidence,
        policyApplied,
      }),
    });
    return;
  }

  // Plugin 4: Smart Model Router (respects app policy)
  let model: ModelTier = requestedModel ?? classifyPrompt(safeText);

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

  // Forward to LLM. A provider error must not take the process down — we log
  // the failure as an audit row and return a 502 with the lifecycle block.
  let result;
  try {
    result = await forwardToLLM(enrichedMessages, model);
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMsg = (err as Error).message ?? String(err);
    await logRequest(
      buildLogEntry({
        team, app, model, promptLength: promptText.length,
        latencyMs,
        status: "blocked", blockReason: "llm_upstream_error",
        decisionLayer: "express",
        kongProcessed: kongEvidence.processedByKong,
        llmCalled: false,
        llmPathMode,
        policyApplied,
      }),
    );
    res.status(502).json({
      error: "llm_upstream_error",
      message: errorMsg,
      lifecycle: lifecycleResponse({
        decisionLayer: "express",
        decisionDetail: "LLM provider rejected the call (Kong + App passed, provider failed)",
        llmCalled: false,
        llmPathMode,
        kongEvidence,
        policyApplied,
      }),
    });
    return;
  }
  const latencyMs = Date.now() - start;

  // Plugin 6: Cost Tracking
  const { prompt_tokens: inputTokens, completion_tokens: outputTokens } = result.usage;
  const cost = calculateCost(model, inputTokens, outputTokens);
  recordSpend(team, cost);

  const status = wasMasked ? "masked" : "passed";
  const piiMaskedTypes = wasMasked ? piiResult.maskedTypes.join(",") : "";

  // Plugin 7: Audit Logger
  await logRequest(
    buildLogEntry({
      team, app, model, promptLength: promptText.length,
      inputTokens, outputTokens, costUsd: cost, latencyMs,
      status,
      blockReason: piiMaskedTypes,
      decisionLayer: "llm",
      kongProcessed: kongEvidence.processedByKong,
      llmCalled: true,
      llmPathMode,
      dataSource: dataSource ?? "",
      piiMaskedTypes,
      policyApplied,
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
      pii_masked: wasMasked,
      masked_types: piiResult.maskedTypes,
      policy: {
        maxPromptLength: policy.model.maxPromptLength,
        allowLargeModel: policy.model.allowLarge,
        piiMaskingEnabled: policy.pii.allowMasking,
      },
    },
    lifecycle: lifecycleResponse({
      decisionLayer: "llm",
      decisionDetail: wasMasked
        ? "App governance masked PII, then LLM was called"
        : "Kong + App governance passed, LLM was called",
      llmCalled: true,
      llmPathMode,
      kongEvidence,
      policyApplied,
      maskedTypes: piiResult.maskedTypes,
      dataSource,
      model,
    }),
  });
});

interface LifecycleArgs {
  decisionLayer: "kong" | "express" | "llm";
  decisionDetail: string;
  llmCalled: boolean;
  llmPathMode: string;
  kongEvidence: ReturnType<typeof buildKongEvidence>;
  policyApplied: string;
  blockedTypes?: string[];
  maskedTypes?: string[];
  dataSource?: string | null;
  model?: ModelTier;
}

function lifecycleResponse(args: LifecycleArgs) {
  return {
    decisionLayer: args.decisionLayer,
    decisionDetail: args.decisionDetail,
    llmCalled: args.llmCalled,
    llmPathMode: args.llmPathMode,
    kongEvidence: args.kongEvidence,
    appGovernance: {
      policyApplied: args.policyApplied,
      blockedTypes: args.blockedTypes ?? [],
      maskedTypes: args.maskedTypes ?? [],
      dataSource: args.dataSource ?? null,
      modelSelected: args.model ?? null,
    },
  };
}
