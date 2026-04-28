#!/usr/bin/env node
// Secret-leak guard. Scans every git-tracked file for known-secret patterns
// and any sensitive blocklist entries the user has configured. Exits non-zero
// if anything matches, so a CI step or `npm run secret-check` can hard-fail
// before a bad commit lands.
//
// What it looks for:
//   1. Generic OpenRouter live keys: /sk-or-v1-[A-Za-z0-9]{30,}/
//   2. The exact OpenRouter key value the demo uses today (read from
//      gateway/.env if present — that file is git-ignored, so finding the
//      same value in any TRACKED file is a leak).
//   3. The Kong Enterprise license signature value (read from
//      infra/kong/license.json if present — same logic).
//   4. Any explicit additions in gateway/scripts/secret-blocklist.txt
//      (one pattern per line; `#` comments allowed). Optional.
//
// What it does NOT do: scan the whole filesystem. We deliberately use
// `git ls-files` so untracked files (.env, license.json, build outputs)
// are skipped — they're protected by .gitignore, not by us.

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

function readEnvValue(envPath, key) {
  if (!existsSync(envPath)) return null;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim();
  }
  return null;
}

function readJsonValue(jsonPath, dotted) {
  if (!existsSync(jsonPath)) return null;
  try {
    const obj = JSON.parse(readFileSync(jsonPath, "utf-8"));
    return dotted.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj) ?? null;
  } catch {
    return null;
  }
}

function readBlocklist(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

const patterns = [];

// 1. Generic OpenRouter live key shape.
patterns.push({
  name: "OpenRouter live key (sk-or-v1-…)",
  re: /sk-or-v1-[A-Za-z0-9]{30,}/,
});

// 2. Today's actual OpenRouter key (from gateway/.env).
const liveOpenRouterKey = readEnvValue(join(repoRoot, "gateway/.env"), "LLM_API_KEY");
if (
  liveOpenRouterKey &&
  liveOpenRouterKey !== "" &&
  !/^sk-or-REPLACE/i.test(liveOpenRouterKey) &&
  !/^sk-or-your/i.test(liveOpenRouterKey)
) {
  patterns.push({
    name: "Local OpenRouter key value (gateway/.env)",
    needle: liveOpenRouterKey,
  });
}

// 3. Kong Enterprise license signature.
const kongSig = readJsonValue(join(repoRoot, "infra/kong/license.json"), "license.signature");
if (kongSig && kongSig.length > 20) {
  patterns.push({ name: "Kong Enterprise license signature", needle: kongSig });
}

// 4. User-supplied blocklist.
for (const entry of readBlocklist(join(here, "secret-blocklist.txt"))) {
  patterns.push({ name: `Blocklist entry: ${entry.slice(0, 24)}…`, needle: entry });
}

if (patterns.length === 0) {
  console.log("secret-check: no patterns to scan (no .env / license / blocklist found).");
  process.exit(0);
}

let trackedFiles;
try {
  trackedFiles = execSync("git ls-files", { cwd: repoRoot, encoding: "utf-8" })
    .split("\n")
    .filter(Boolean);
} catch (err) {
  console.error("secret-check: failed to enumerate tracked files via git.");
  console.error(err.message || err);
  process.exit(2);
}

// Skip self — the script intentionally references the regexp shape, and the
// secret-blocklist.txt file (if present) is also allowed to contain values.
const SKIP = new Set([
  "gateway/scripts/secret-check.mjs",
  "gateway/scripts/secret-blocklist.txt",
]);

const findings = [];

for (const file of trackedFiles) {
  if (SKIP.has(file)) continue;
  let text;
  try {
    text = readFileSync(join(repoRoot, file), "utf-8");
  } catch {
    continue; // binary or missing — skip
  }
  for (const p of patterns) {
    if (p.re && p.re.test(text)) {
      findings.push({ file, name: p.name, sample: text.match(p.re)?.[0]?.slice(0, 16) + "…" });
    } else if (p.needle && text.includes(p.needle)) {
      findings.push({ file, name: p.name, sample: p.needle.slice(0, 16) + "…" });
    }
  }
}

if (findings.length === 0) {
  console.log(`✓ secret-check: scanned ${trackedFiles.length} tracked files against ${patterns.length} pattern(s) — clean.`);
  process.exit(0);
}

console.error(`✗ secret-check: ${findings.length} finding(s):`);
for (const f of findings) {
  console.error(`  - ${f.file}: ${f.name} [match=${f.sample}]`);
}
console.error("\nFix: remove the secret from the file (and rotate the key if it ever reached a remote).");
process.exit(1);
