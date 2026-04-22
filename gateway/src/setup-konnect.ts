// ============================================================
// Kong Konnect Setup Script
// Run: npx tsx kong/setup-konnect.ts
//
// Before running, create a .env file in the project root with:
//   KONNECT_TOKEN=your-token
//   KONNECT_CONTROL_PLANE_ID=your-id
// ============================================================

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env file
const dir = import.meta.dirname ?? ".";
const envPath = [
  resolve(dir, "../../.env"),
  resolve(dir, "../.env"),
  resolve(process.cwd(), ".env"),
].find((p) => { try { readFileSync(p); return true; } catch { return false; } }) ?? ".env";
try {
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    process.env[key.trim()] = rest.join("=").trim();
  }
} catch {
  console.error("No .env file found. Create one from .env.example first.");
  process.exit(1);
}

const KONNECT_TOKEN = process.env.KONNECT_TOKEN;
const CONTROL_PLANE_ID = process.env.KONNECT_CONTROL_PLANE_ID;

if (!KONNECT_TOKEN || KONNECT_TOKEN === "your-personal-access-token-here") {
  console.error("Set KONNECT_TOKEN in your .env file");
  process.exit(1);
}

if (!CONTROL_PLANE_ID || CONTROL_PLANE_ID === "your-control-plane-id-here") {
  console.error("Set KONNECT_CONTROL_PLANE_ID in your .env file");
  process.exit(1);
}

const KONNECT_REGION = process.env.KONNECT_REGION || "eu";
const BASE_URL = `https://${KONNECT_REGION}.api.konghq.com/v2/control-planes/${CONTROL_PLANE_ID}/core-entities`;

const headers = {
  Authorization: `Bearer ${KONNECT_TOKEN}`,
  "Content-Type": "application/json",
};

async function api(method: string, path: string, body?: object) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function setup() {
  console.log("Setting up Kong Konnect...\n");

  // 1. Create Service
  console.log("1. Creating service...");
  const service = await api("POST", "/services", {
    name: "ai-governance-gateway",
    url: "http://localhost:8000",
  });
  const serviceId = service.id;
  console.log(`   Service ID: ${serviceId}\n`);

  // 2. Create Routes
  console.log("2. Creating routes...");

  await api("POST", `/services/${serviceId}/routes`, {
    name: "ai-chat-route",
    paths: ["/ai/chat"],
    methods: ["POST", "OPTIONS"],
  });
  console.log("   /ai/chat route created");

  await api("POST", `/services/${serviceId}/routes`, {
    name: "admin-route",
    paths: ["/admin"],
    methods: ["GET"],
  });
  console.log("   /admin route created");

  await api("POST", `/services/${serviceId}/routes`, {
    name: "health-route",
    paths: ["/health"],
    methods: ["GET"],
  });
  console.log("   /health route created\n");

  // 3. Enable Plugins
  console.log("3. Enabling plugins...");

  await api("POST", "/plugins", {
    name: "rate-limiting",
    config: { minute: 60, hour: 1000, policy: "local" },
    service: { id: serviceId },
  });
  console.log("   Rate limiting enabled (60/min, 1000/hour)");

  await api("POST", "/plugins", {
    name: "key-auth",
    config: { key_names: ["x-api-key"] },
    service: { id: serviceId },
  });
  console.log("   Key auth enabled");

  await api("POST", "/plugins", {
    name: "cors",
    config: {
      origins: ["*"],
      methods: ["GET", "POST", "OPTIONS"],
      headers: ["*"],
      credentials: false,
    },
    service: { id: serviceId },
  });
  console.log("   CORS enabled\n");

  // 4. Create Consumers
  console.log("4. Creating consumers...");

  const teams: Record<string, string[]> = {
    engineering: ["eng-key-2024", "chat-key-2024"],
    "data-science": ["ds-key-2024", "scheduler-key-2024"],
    marketing: ["mkt-key-2024"],
  };

  for (const [team, keys] of Object.entries(teams)) {
    const consumer = await api("POST", "/consumers", { username: team });
    console.log(`   Consumer '${team}' created`);

    for (const key of keys) {
      await api("POST", `/consumers/${consumer.id}/key-auth`, { key });
      console.log(`     Key '${key}' added`);
    }
  }

  console.log("\n============================================================");
  console.log("Kong Konnect setup complete!");
  console.log(`Gateway URL: ${process.env.KONNECT_GATEWAY_URL || "check your Konnect dashboard"}`);
  console.log("============================================================");
}

setup().catch(console.error);
