import type { BlockResult } from "../types.js";

const PII_PATTERNS: ReadonlyMap<string, RegExp> = new Map([
  ["email", /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/],
  ["ssn", /\b\d{3}-\d{2}-\d{4}\b/],
  ["credit_card", /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/],
  ["phone", /\b\+?\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/],
  ["ip_address", /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/],
]);

const BLOCKED_KEYWORDS: readonly string[] = [
  "social security",
  "credit card number",
  "password",
  "secret key",
  "api key",
  "private key",
] as const;

function scanPII(text: string): string[] {
  const found: string[] = [];
  for (const [type, pattern] of PII_PATTERNS) {
    if (pattern.test(text)) {
      found.push(type);
    }
  }
  return found;
}

function scanKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return BLOCKED_KEYWORDS.filter((kw) => lower.includes(kw));
}

export function checkRequest(promptText: string): BlockResult | null {
  const piiFound = scanPII(promptText);
  if (piiFound.length > 0) {
    return {
      reason: "pii_detected",
      details: piiFound,
      message: `Request blocked: sensitive data detected (${piiFound.join(", ")})`,
    };
  }

  const keywordsFound = scanKeywords(promptText);
  if (keywordsFound.length > 0) {
    return {
      reason: "blocked_keyword",
      details: keywordsFound,
      message: "Request blocked: prohibited content detected",
    };
  }

  return null;
}
