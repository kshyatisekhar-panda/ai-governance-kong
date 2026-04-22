import type { ModelTier } from "../types.js";

const COMPLEXITY_KEYWORDS: readonly string[] = [
  "analyze",
  "compare",
  "explain in detail",
  "write a report",
  "summarize the quarterly",
  "predict",
  "recommend",
  "evaluate",
  "design",
  "architect",
  "optimize",
  "investigate",
] as const;

const MAX_SIMPLE_LENGTH = 100;

export function classifyPrompt(promptText: string): ModelTier {
  if (promptText.length > MAX_SIMPLE_LENGTH) return "large";

  const lower = promptText.toLowerCase();
  const isComplex = COMPLEXITY_KEYWORDS.some((kw) => lower.includes(kw));

  return isComplex ? "large" : "small";
}
