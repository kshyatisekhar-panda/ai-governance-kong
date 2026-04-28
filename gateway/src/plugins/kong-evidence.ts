import type { Request } from "express";
import type { KongEvidence } from "../types.js";

// Plugins configured in infra/kong/kong.yml. These are "expected" — the app
// cannot directly observe whether Kong actually executed each one. The flag
// processedByKong is the only evidence the app has, derived from the
// X-Governance-* headers Kong's response-transformer adds.
const KONG_PLUGINS_BY_ROUTE: Readonly<Record<string, readonly string[]>> = {
  "/ai/chat": [
    "key-auth",
    "rate-limiting",
    "cors",
    "request-size-limiting",
    "bot-detection",
    "response-transformer",
    "ai-prompt-guard",
  ],
  "/api": [
    "key-auth",
    "rate-limiting",
    "cors",
    "request-size-limiting",
    "bot-detection",
    "response-transformer",
  ],
  "/admin": [
    "key-auth",
    "rate-limiting",
    "cors",
    "request-size-limiting",
    "bot-detection",
    "response-transformer",
  ],
};

const KONG_HEADER_NAMES = [
  "x-governance-gateway",
  "x-governance-version",
  "x-governance-policy",
  "via",
  "x-kong-proxy-latency",
  "x-kong-upstream-latency",
];

function pluginsForRoute(route: string): string[] {
  for (const [prefix, plugins] of Object.entries(KONG_PLUGINS_BY_ROUTE)) {
    if (route === prefix || route.startsWith(prefix + "/")) {
      return [...plugins];
    }
  }
  return [];
}

// Headers that survive a hop through Kong are mostly response headers, but
// inbound requests preserve enough markers to distinguish a Kong-fronted call
// from a direct hit on Express :8001. We look for any of:
//  - via:                     Kong sets this when proxying
//  - x-forwarded-for / -host: present on proxied requests
//  - x-consumer-username:     Kong sets this when key-auth identifies a consumer
function detectKongProcessed(req: Request): KongEvidence["processedByKong"] {
  const h = req.headers;
  const via = String(h["via"] ?? "").toLowerCase();
  if (via.includes("kong")) return "observed";
  if (h["x-consumer-username"] || h["x-consumer-id"]) return "observed";
  if (h["x-forwarded-for"] && h["x-forwarded-host"]) return "observed";
  return "unknown";
}

function pickHeaders(req: Request): Record<string, string> {
  const seen: Record<string, string> = {};
  for (const name of KONG_HEADER_NAMES) {
    const v = req.headers[name];
    if (typeof v === "string" && v.length > 0) seen[name] = v;
    else if (Array.isArray(v) && v.length > 0) seen[name] = v[0];
  }
  return seen;
}

export function buildKongEvidence(req: Request, route: string): KongEvidence {
  const consumer = req.headers["x-consumer-username"];
  return {
    processedByKong: detectKongProcessed(req),
    kongRoute: route,
    kongConsumer: typeof consumer === "string" ? consumer : null,
    kongPluginsExpected: pluginsForRoute(route),
    kongHeadersSeen: pickHeaders(req),
  };
}
