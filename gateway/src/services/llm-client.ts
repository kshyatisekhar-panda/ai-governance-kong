import { config } from "../config.js";
import type { ChatMessage, LLMResponse, ModelTier } from "../types.js";

const MODEL_MAP: Record<ModelTier, string> = {
  small: "google/gemma-4-31b-it:free",
  large: "nvidia/nemotron-3-super-120b-a12b:free",
};

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

  const response = await fetch(
    `${config.llmBaseUrl}/v1/chat/completions`,
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
