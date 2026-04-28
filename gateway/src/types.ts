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

export interface SocEvent {
  eventId: string;
  timestamp: string;
  layer: string;
  decision: string;
  blockReason: string;
  method: string;
  path: string;
  clientIp: string;
  consumer: string;
  routeName: string;
  model: string;
  llmCalled: boolean;
  datapoints: Record<string, string>;
}
