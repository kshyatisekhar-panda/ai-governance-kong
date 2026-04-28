#!/usr/bin/env node
// Local-only demo reset. Calls POST /admin/demo-reset on the running gateway.
// Requires the gateway to have been started with ALLOW_DEMO_RESET=true.
const BASE = process.env.SMOKE_BASE || process.env.RESET_BASE || "http://localhost:8001";
const url = `${BASE}/admin/demo-reset`;

(async () => {
  let res;
  try {
    res = await fetch(url, { method: "POST" });
  } catch (err) {
    console.error(`Could not reach ${url} — is the gateway running?\n${err}`);
    process.exit(2);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    console.error(`Reset failed (HTTP ${res.status}):`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log(`Demo reset OK: ${body.message}`);
})();
