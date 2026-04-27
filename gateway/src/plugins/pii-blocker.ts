import type { BlockResult } from "../types.js";
import type { AppPolicy } from "./app-policy.js";

// Sensitive PII: blocked by default
const SENSITIVE_PATTERNS: ReadonlyMap<string, RegExp> = new Map([
  ["ssn", /\b\d{3}-\d{2}-\d{4}\b/g],
  ["credit_card", /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g],
  ["swedish_personnummer", /\b\d{6}[-]?\d{4}\b/g],
]);

// Regular PII: can be masked or blocked depending on app policy
const MASKABLE_PATTERNS: ReadonlyMap<string, { pattern: RegExp; replacement: string; policyKey: keyof AppPolicy["pii"] }> = new Map([
  ["email", { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "[EMAIL_REDACTED]", policyKey: "blockEmail" }],
  ["phone", { pattern: /\b\+?\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g, replacement: "[PHONE_REDACTED]", policyKey: "blockPhone" }],
  ["ip_address", { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: "[IP_REDACTED]", policyKey: "blockEmail" }],
]);

const BLOCKED_KEYWORDS: readonly string[] = [
  "social security",
  "credit card number",
  "password",
  "secret key",
  "api key",
  "private key",
] as const;

export interface PIIResult {
  decision: "allowed" | "masked" | "blocked";
  originalText: string;
  safeText: string;
  piiFound: string[];
  maskedTypes: string[];
  blockedTypes: string[];
  message: string;
  policyApplied: string;
}

function scanKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return BLOCKED_KEYWORDS.filter((kw) => lower.includes(kw));
}

export function scanAndProcess(promptText: string, policy?: AppPolicy["pii"]): PIIResult {
  const blockedTypes: string[] = [];
  const maskedTypes: string[] = [];
  const policyName = policy ? "app-specific" : "default";

  // Check for blocked keywords
  if (!policy || policy.blockKeywords) {
    const keywordsFound = scanKeywords(promptText);
    if (keywordsFound.length > 0) {
      return {
        decision: "blocked",
        originalText: promptText,
        safeText: "",
        piiFound: keywordsFound,
        maskedTypes: [],
        blockedTypes: keywordsFound,
        message: "Request blocked: prohibited content detected",
        policyApplied: policyName,
      };
    }
  }

  // Check for sensitive PII
  if (!policy || policy.blockSensitive) {
    for (const [type, pattern] of SENSITIVE_PATTERNS) {
      const fresh = new RegExp(pattern.source, pattern.flags);
      if (fresh.test(promptText)) {
        blockedTypes.push(type);
      }
    }

    if (blockedTypes.length > 0) {
      return {
        decision: "blocked",
        originalText: promptText,
        safeText: "",
        piiFound: blockedTypes,
        maskedTypes: [],
        blockedTypes,
        message: `Request blocked: sensitive data detected (${blockedTypes.join(", ")})`,
        policyApplied: policyName,
      };
    }
  }

  // Check for maskable PII
  let safeText = promptText;
  for (const [type, { pattern, replacement, policyKey }] of MASKABLE_PATTERNS) {
    const fresh = new RegExp(pattern.source, pattern.flags);
    if (!fresh.test(safeText)) continue;

    // If policy says block this type (e.g. chat blocks email)
    if (policy && policy[policyKey] === true) {
      blockedTypes.push(type);
      continue;
    }

    // If policy allows masking, redact and forward
    if (!policy || policy.allowMasking) {
      maskedTypes.push(type);
      safeText = safeText.replace(new RegExp(pattern.source, pattern.flags), replacement);
    } else {
      // No masking allowed, block
      blockedTypes.push(type);
    }
  }

  if (blockedTypes.length > 0) {
    return {
      decision: "blocked",
      originalText: promptText,
      safeText: "",
      piiFound: [...blockedTypes, ...maskedTypes],
      maskedTypes: [],
      blockedTypes,
      message: `Request blocked: PII not allowed for this app (${blockedTypes.join(", ")})`,
      policyApplied: policyName,
    };
  }

  if (maskedTypes.length > 0) {
    return {
      decision: "masked",
      originalText: promptText,
      safeText,
      piiFound: maskedTypes,
      maskedTypes,
      blockedTypes: [],
      message: `PII detected and redacted: ${maskedTypes.join(", ")}`,
      policyApplied: policyName,
    };
  }

  return {
    decision: "allowed",
    originalText: promptText,
    safeText: promptText,
    piiFound: [],
    maskedTypes: [],
    blockedTypes: [],
    message: "",
    policyApplied: policyName,
  };
}

export function checkRequest(promptText: string): BlockResult | null {
  const result = scanAndProcess(promptText);
  if (result.decision === "blocked") {
    return {
      reason: result.blockedTypes.length > 0 ? "pii_detected" : "blocked_keyword",
      details: result.piiFound,
      message: result.message,
    };
  }
  return null;
}
