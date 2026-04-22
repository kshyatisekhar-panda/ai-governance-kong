import express from "express";
import { config } from "./config.js";
import { corsMiddleware } from "./middleware/cors.js";
import { chatRouter } from "./routes/chat.js";
import { adminRouter } from "./routes/admin.js";
import { businessRouter } from "./routes/business.js";

const app = express();

app.use(corsMiddleware);
app.use(express.json());

app.use("/ai/chat", chatRouter);
app.use("/admin", adminRouter);
app.use("/api", businessRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-governance-gateway" });
});

app.listen(config.port, () => {
  console.log(`AI Governance Gateway running on :${config.port}`);
});
