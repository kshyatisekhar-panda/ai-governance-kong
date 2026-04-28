import express from "express";
import { resolve, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { corsMiddleware } from "./middleware/cors.js";
import { chatRouter } from "./routes/chat.js";
import { adminRouter } from "./routes/admin.js";
import { businessRouter } from "./routes/business.js";
import { compatRouter } from "./routes/compat.js";
import { serviceCasesRouter } from "./routes/service-cases.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(corsMiddleware);
app.use(express.json());

app.use("/ai/chat", chatRouter);
app.use("/admin", adminRouter);
app.use("/api/service-cases", serviceCasesRouter);
app.use("/api", businessRouter);
app.use("/api", compatRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-governance-gateway" });
});

app.get("/debug/config", (_req, res) => {
  res.json({
    llmBaseUrl: config.llmBaseUrl,
    llmApiKeyPrefix: config.llmApiKey ? config.llmApiKey.slice(0, 10) + "..." : "(not set)",
    llmApiKeyLength: config.llmApiKey?.length ?? 0,
  });
});

// Serve the frontend apps as static files (production single-container mode)
const appsDir = resolve(__dirname, "../../apps");
if (existsSync(appsDir)) {
  app.use(express.static(appsDir));
  console.log(`Serving static frontend from ${appsDir}`);
}

app.listen(config.port, () => {
  console.log(`AI Governance Gateway running on :${config.port}`);
});
