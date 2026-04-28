import { config } from "../config.js";
import type { ChatMessage, LLMResponse, ModelTier } from "../types.js";

export const MODEL_MAP: Record<ModelTier, string> = {
  small: "meta-llama/llama-3.1-8b-instruct",
  large: "meta-llama/llama-3.1-70b-instruct",
};

export function resolveModelName(tier: ModelTier): string {
  return MODEL_MAP[tier] ?? MODEL_MAP.small;
}

export async function forwardToLLM(
  messages: ChatMessage[],
  model: ModelTier,
): Promise<LLMResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "HTTP-Referer": "https://ai-governance-kong-production.up.railway.app",
    "X-Title": "AI Governance Gateway",
  };

  if (config.llmApiKey) {
    headers["Authorization"] = `Bearer ${config.llmApiKey}`;
  }

  const url = `${config.llmBaseUrl}/v1/chat/completions`;
  console.log(`[llm-client] POST ${url} (key prefix: ${config.llmApiKey.slice(0, 12)}...)`);
  const response = await fetch(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        model: MODEL_MAP[model] ?? MODEL_MAP.small,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM responded with status ${response.status}: ${error}`);
  }

  return response.json() as Promise<LLMResponse>;
}
