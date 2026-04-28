export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: ModelTier;
}

export type ModelTier = "small" | "large";

export type RequestStatus = "passed" | "masked" | "blocked";

export type BlockReason =
  | "pii_detected"
  | "pii_masked"
  | "blocked_keyword"
  | "budget_exceeded";

export interface ClientIdentity {
  team: string;
  app: string;
}

export interface BlockResult {
  reason: BlockReason;
  details: string[];
  message: string;
}

export type DecisionLayer = "kong" | "express" | "llm" | "";
export type KongObserved = "observed" | "unknown";
export type LlmPathMode = "direct-provider" | "kong-ai-route" | "mock" | "";

export interface RequestLogEntry {
  team: string;
  app: string;
  model: string;
  promptLength: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: RequestStatus;
  blockReason: string;
  // Lifecycle / evidence (all optional — older callers can omit)
  decisionLayer?: DecisionLayer;
  kongRoute?: string;
  kongProcessed?: KongObserved;
  llmCalled?: boolean;
  llmPathMode?: LlmPathMode;
  dataSource?: string;
  piiMaskedTypes?: string;
  policyApplied?: string;
}

export interface KongEvidence {
  processedByKong: "observed" | "unknown";
  kongRoute: string;
  kongConsumer: string | null;
  kongPluginsExpected: string[];
  kongHeadersSeen: Record<string, string>;
}

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LLMResponse {
  id: string;
  object: string;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: LLMUsage;
  latency_ms: number;
}

export interface GatewayMetadata {
  team: string;
  app: string;
  model_routed: ModelTier;
  cost_usd: number;
  latency_ms: number;
}

export interface BudgetStatus {
  team: string;
  spent: number;
  limit: number;
  percentage: number;
}
