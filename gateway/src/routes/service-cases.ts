import { Router } from "express";
import type { Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { scanAndProcess } from "../plugins/pii-blocker.js";
import { calculateCost, checkBudget, recordSpend } from "../plugins/cost-tracker.js";
import { classifyPrompt } from "../plugins/smart-router.js";
import { getAppPolicy } from "../plugins/app-policy.js";
import { forwardToLLM } from "../services/llm-client.js";
import { logRequest } from "../services/logger.js";
import {
  createCase,
  getCaseById,
  listCases,
  applyTriage,
  setSuggestedReply,
  type ServiceCase,
  type ServiceCaseInput,
  type TriageResult,
  type CasePriority,
} from "../services/crm-service.js";
import type { ChatMessage, ModelTier } from "../types.js";

export const serviceCasesRouter = Router();
serviceCasesRouter.use(authMiddleware);

const TRIAGE_SYSTEM_PROMPT = `You are an Atlas Copco industrial service triage assistant.
Given a redacted CRM service case, classify priority, category, route-to team, business impact, and a suggested first reply.
Do not infer personal data. Do not ask for national IDs or payment details.
Return STRICT JSON with this exact shape and no extra commentary:
{
  "priority": "Low" | "Medium" | "High" | "Critical",
  "category": string,
  "routeTo": "Field Service" | "Technical Support" | "Spare Parts" | "Warranty" | "Customer Service",
  "businessImpact": string,
  "summary": string,
  "suggestedReply": string,
  "confidence": number
}`;

const REPLY_SYSTEM_PROMPT = `Draft a professional first response for this Atlas Copco service case.
Use only the redacted operational details. Do not include personal contact details.
Keep it concise, service-oriented, and friendly. Sign off as "Atlas Copco Customer Service".`;

const REQUIRED_FIELDS: Array<keyof ServiceCaseInput> = [
  "customerName", "email", "phone", "company", "country", "region",
  "product", "issueCategory", "urgency", "preferredContactChannel", "issueDescription",
];

function validateBody(body: Record<string, unknown>): { ok: true; input: ServiceCaseInput } | { ok: false; missing: string[] } {
  const missing = REQUIRED_FIELDS.filter((k) => {
    const v = body[k];
    return v === undefined || v === null || String(v).trim() === "";
  });
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    input: {
      customerName: String(body.customerName).trim(),
      email: String(body.email).trim(),
      phone: String(body.phone).trim(),
      company: String(body.company).trim(),
      country: String(body.country).trim(),
      region: String(body.region).trim(),
      product: String(body.product).trim(),
      serialNumber: body.serialNumber ? String(body.serialNumber).trim() : undefined,
      issueCategory: String(body.issueCategory).trim(),
      urgency: String(body.urgency).trim(),
      preferredContactChannel: String(body.preferredContactChannel).trim(),
      issueDescription: String(body.issueDescription).trim(),
      sourceChannel: body.sourceChannel ? String(body.sourceChannel) : undefined,
    },
  };
}

function buildSafeCaseContext(c: ServiceCase, policy = getAppPolicy("Case Management")): {
  text: string;
  blocked: boolean;
  maskedTypes: string[];
  blockedTypes: string[];
} {
  const piiResult = scanAndProcess(c.issueDescription, policy.pii);
  let safeIssue: string;
  if (piiResult.decision === "blocked") {
    safeIssue = "[REDACTED ISSUE DESCRIPTION]";
  } else if (piiResult.decision === "masked") {
    safeIssue = piiResult.safeText;
  } else {
    safeIssue = c.issueDescription;
  }

  const text = [
    `Case Number: ${c.caseNumber}`,
    `Region: ${c.region}`,
    `Country: ${c.country}`,
    `Product: ${c.product}`,
    c.serialNumber ? `Serial Number: ${c.serialNumber}` : null,
    `Issue Category: ${c.issueCategory}`,
    `Urgency: ${c.urgency}`,
    `Preferred Contact Channel: ${c.preferredContactChannel}`,
    `Customer (redacted): [NAME_REDACTED] @ ${c.company}`,
    `Issue Description (redacted): ${safeIssue}`,
  ].filter(Boolean).join("\n");

  return {
    text,
    blocked: piiResult.decision === "blocked",
    maskedTypes: piiResult.maskedTypes,
    blockedTypes: piiResult.blockedTypes,
  };
}

function parseTriageJson(text: string, fallbackPriority: CasePriority): TriageResult {
  let parsed: Partial<TriageResult> | undefined;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      parsed = JSON.parse(text.slice(start, end + 1)) as Partial<TriageResult>;
    }
  } catch {
    parsed = undefined;
  }
  const priorities: CasePriority[] = ["Low", "Medium", "High", "Critical"];
  const priority = parsed?.priority && priorities.includes(parsed.priority as CasePriority)
    ? (parsed.priority as CasePriority)
    : fallbackPriority;

  return {
    priority,
    category: parsed?.category ?? "General",
    routeTo: parsed?.routeTo ?? "Customer Service",
    businessImpact: parsed?.businessImpact ?? "Unknown business impact",
    summary: parsed?.summary ?? "Service case received and queued.",
    suggestedReply: parsed?.suggestedReply ??
      "Thank you for reaching out. Our service team will follow up shortly with next steps.",
    confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0.5,
  };
}

interface TriageRunResult {
  triage: TriageResult;
  status: "Completed" | "Failed" | "Skipped";
  governance: {
    decision: "passed" | "masked" | "blocked";
    blockReason: string;
    model: ModelTier | "";
    costUsd: number;
    latencyMs: number;
    maskedTypes: string[];
    safeContext: string;
  };
  httpStatus: number;
  warning?: string;
}

async function runTriage(c: ServiceCase, team: string, app: string): Promise<TriageRunResult> {
  const start = Date.now();
  const policy = getAppPolicy(app);
  const ctx = buildSafeCaseContext(c, policy);

  if (ctx.blocked) {
    const triage = parseTriageJson("", c.priority);
    applyTriage(c.id, triage, "Failed");
    await logRequest({
      team, app, model: "", promptLength: ctx.text.length,
      inputTokens: 0, outputTokens: 0, costUsd: 0,
      latencyMs: Date.now() - start,
      status: "blocked",
      blockReason: ctx.blockedTypes.join(",") || "pii_blocked",
    });
    return {
      triage,
      status: "Failed",
      governance: {
        decision: "blocked",
        blockReason: ctx.blockedTypes.join(",") || "pii_blocked",
        model: "",
        costUsd: 0,
        latencyMs: Date.now() - start,
        maskedTypes: [],
        safeContext: ctx.text,
      },
      httpStatus: 200,
      warning: "Triage skipped: issue description contained sensitive data.",
    };
  }

  const budget = checkBudget(team);
  if (budget) {
    const triage = parseTriageJson("", c.priority);
    applyTriage(c.id, triage, "Failed");
    await logRequest({
      team, app, model: "", promptLength: ctx.text.length,
      inputTokens: 0, outputTokens: 0, costUsd: 0,
      latencyMs: Date.now() - start,
      status: "blocked", blockReason: "budget_exceeded",
    });
    return {
      triage,
      status: "Failed",
      governance: {
        decision: "blocked", blockReason: "budget_exceeded",
        model: "", costUsd: 0, latencyMs: Date.now() - start,
        maskedTypes: [], safeContext: ctx.text,
      },
      httpStatus: 200,
      warning: budget.message,
    };
  }

  let model: ModelTier = classifyPrompt(ctx.text);
  if (model === "large" && !policy.model.allowLarge) model = "small";
  if (model === "small" && !policy.model.allowSmall) model = "large";

  const messages: ChatMessage[] = [
    { role: "system", content: TRIAGE_SYSTEM_PROMPT },
    { role: "user", content: ctx.text },
  ];

  let triage: TriageResult;
  let cost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let triageStatus: "Completed" | "Failed" = "Completed";
  let warning: string | undefined;

  try {
    const result = await forwardToLLM(messages, model);
    inputTokens = result.usage.prompt_tokens;
    outputTokens = result.usage.completion_tokens;
    cost = calculateCost(model, inputTokens, outputTokens);
    recordSpend(team, cost);
    const aiText = result.choices[0]?.message?.content ?? "";
    triage = parseTriageJson(aiText, c.priority);
  } catch (err) {
    triageStatus = "Failed";
    warning = err instanceof Error ? err.message : "LLM provider error";
    triage = parseTriageJson("", c.priority);
  }

  applyTriage(c.id, triage, triageStatus);
  const latencyMs = Date.now() - start;
  const wasMasked = ctx.maskedTypes.length > 0;
  const status = wasMasked ? "masked" : "passed";

  await logRequest({
    team, app, model, promptLength: ctx.text.length,
    inputTokens, outputTokens, costUsd: cost, latencyMs,
    status,
    blockReason: wasMasked ? ctx.maskedTypes.join(",") : "",
  });

  return {
    triage,
    status: triageStatus,
    governance: {
      decision: status,
      blockReason: wasMasked ? ctx.maskedTypes.join(",") : "",
      model, costUsd: cost, latencyMs,
      maskedTypes: ctx.maskedTypes,
      safeContext: ctx.text,
    },
    httpStatus: 200,
    warning,
  };
}

serviceCasesRouter.post("/", async (req: Request, res: Response) => {
  const { team, app } = req.client!;
  const validated = validateBody(req.body ?? {});
  if (!validated.ok) {
    res.status(400).json({ error: "validation_failed", missing: validated.missing });
    return;
  }

  const created = createCase(validated.input);
  const triageResult = await runTriage(created, team, app);
  const updated = getCaseById(created.id) ?? created;

  res.status(201).json({
    case: updated,
    triage: triageResult.triage,
    governance: triageResult.governance,
    safeContext: triageResult.governance.safeContext,
    ...(triageResult.warning ? { warning: triageResult.warning } : {}),
  });
});

serviceCasesRouter.get("/", (req: Request, res: Response) => {
  const result = listCases({
    status: req.query.status as string | undefined,
    priority: req.query.priority as string | undefined,
    product: req.query.product as string | undefined,
    region: req.query.region as string | undefined,
    aiTriageStatus: req.query.aiTriageStatus as string | undefined,
    search: req.query.search as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

serviceCasesRouter.get("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const c = getCaseById(id);
  if (!c) {
    res.status(404).json({ error: "case_not_found" });
    return;
  }
  const ctx = buildSafeCaseContext(c);
  res.json({ case: c, safeContext: ctx.text });
});

serviceCasesRouter.post("/:id/triage", async (req: Request, res: Response) => {
  const { team, app } = req.client!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const c = getCaseById(id);
  if (!c) {
    res.status(404).json({ error: "case_not_found" });
    return;
  }
  const result = await runTriage(c, team, app);
  const updated = getCaseById(id) ?? c;
  res.json({
    case: updated,
    triage: result.triage,
    governance: result.governance,
    safeContext: result.governance.safeContext,
    ...(result.warning ? { warning: result.warning } : {}),
  });
});

serviceCasesRouter.post("/:id/draft-reply", async (req: Request, res: Response) => {
  const { team, app } = req.client!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const c = getCaseById(id);
  if (!c) {
    res.status(404).json({ error: "case_not_found" });
    return;
  }
  const start = Date.now();
  const policy = getAppPolicy(app);
  const ctx = buildSafeCaseContext(c, policy);

  if (ctx.blocked) {
    res.status(403).json({
      error: "pii_in_case",
      message: "Cannot draft reply: issue description contains sensitive data.",
    });
    return;
  }

  const budget = checkBudget(team);
  if (budget) {
    res.status(429).json({ error: budget.reason, message: budget.message });
    return;
  }

  let model: ModelTier = classifyPrompt(ctx.text);
  if (model === "large" && !policy.model.allowLarge) model = "small";
  if (model === "small" && !policy.model.allowSmall) model = "large";

  const messages: ChatMessage[] = [
    { role: "system", content: REPLY_SYSTEM_PROMPT },
    { role: "user", content: ctx.text },
  ];

  try {
    const result = await forwardToLLM(messages, model);
    const inputTokens = result.usage.prompt_tokens;
    const outputTokens = result.usage.completion_tokens;
    const cost = calculateCost(model, inputTokens, outputTokens);
    recordSpend(team, cost);
    const reply = result.choices[0]?.message?.content ?? "";
    setSuggestedReply(c.id, reply);
    const latencyMs = Date.now() - start;
    const wasMasked = ctx.maskedTypes.length > 0;
    const status = wasMasked ? "masked" : "passed";

    await logRequest({
      team, app, model, promptLength: ctx.text.length,
      inputTokens, outputTokens, costUsd: cost, latencyMs,
      status,
      blockReason: wasMasked ? ctx.maskedTypes.join(",") : "",
    });

    res.json({
      reply,
      governance: {
        decision: status,
        model, costUsd: cost, latencyMs,
        maskedTypes: ctx.maskedTypes,
      },
    });
  } catch (err) {
    res.status(502).json({
      error: "llm_error",
      message: err instanceof Error ? err.message : "LLM provider error",
    });
  }
});
