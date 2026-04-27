import Database from "better-sqlite3";
import { config } from "../config.js";
import { seedDatabase } from "./seed.js";
import type { RequestLogEntry } from "../types.js";

const db = new Database(config.sqlitePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    team TEXT,
    app TEXT,
    model TEXT DEFAULT '',
    prompt_length INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    status TEXT,
    block_reason TEXT DEFAULT ''
  )
`);

seedDatabase(db);

export { db };

const insertStmt = db.prepare(`
  INSERT INTO request_logs
    (team, app, model, prompt_length, input_tokens, output_tokens,
     cost_usd, latency_ms, status, block_reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export async function logRequest(entry: RequestLogEntry): Promise<void> {
  try {
    insertStmt.run(
      entry.team,
      entry.app,
      entry.model,
      entry.promptLength,
      entry.inputTokens,
      entry.outputTokens,
      entry.costUsd,
      entry.latencyMs,
      entry.status,
      entry.blockReason,
    );
  } catch (error) {
    console.error("[logger] Failed to write log:", error);
  }
}

export async function getRecentLogs(limit = 100) {
  return db
    .prepare("SELECT * FROM request_logs ORDER BY timestamp DESC LIMIT ?")
    .all(limit);
}

export interface LogFilters {
  decision?: string;
  sourceApp?: string;
  team?: string;
  piiType?: string;
  limit?: number;
}

export function getFilteredLogs(filters: LogFilters) {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.decision) {
    const status = filters.decision === "BLOCKED" ? "blocked" : filters.decision === "MASKED" ? "masked" : "passed";
    conditions.push("status = ?");
    params.push(status);
  }
  if (filters.sourceApp) {
    conditions.push("app = ?");
    params.push(filters.sourceApp);
  }
  if (filters.team) {
    conditions.push("team = ?");
    params.push(filters.team);
  }
  if (filters.piiType) {
    conditions.push("block_reason LIKE ?");
    params.push(`%${filters.piiType}%`);
  }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const limit = filters.limit || 50;
  params.push(limit);

  return db
    .prepare(`SELECT * FROM request_logs ${where} ORDER BY timestamp DESC LIMIT ?`)
    .all(...params);
}

export async function getOverallStats() {
  return db
    .prepare(
      `SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked_requests,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passed_requests,
        COALESCE(SUM(cost_usd), 0) AS total_cost,
        COALESCE(AVG(latency_ms), 0) AS avg_latency
      FROM request_logs`,
    )
    .get();
}

export async function getStatsByTeam() {
  return db
    .prepare(
      `SELECT
        team,
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
        COALESCE(SUM(cost_usd), 0) AS total_cost,
        COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens
      FROM request_logs
      GROUP BY team`,
    )
    .all();
}

export async function getTodayStatsByTeam() {
  return db
    .prepare(
      `SELECT
        team,
        app,
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
        COALESCE(SUM(cost_usd), 0) AS total_cost,
        COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
        MAX(timestamp) AS last_request
      FROM request_logs
      WHERE date(timestamp) = date('now')
      GROUP BY team, app`,
    )
    .all();
}

export async function getStatsByApp() {
  return db
    .prepare(
      `SELECT
        app,
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
        COALESCE(SUM(cost_usd), 0) AS total_cost
      FROM request_logs
      GROUP BY app`,
    )
    .all();
}

export async function getMaskedCount() {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM request_logs WHERE status = 'masked'")
    .get() as { c: number };
  return row.c;
}

export async function getDecisionsOverTime() {
  return db
    .prepare(
      `SELECT
        strftime('%Y-%m-%d %H:00', timestamp) AS hour,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS allowed,
        SUM(CASE WHEN status = 'masked' THEN 1 ELSE 0 END) AS masked,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked
      FROM request_logs
      WHERE timestamp >= datetime('now', '-24 hours')
      GROUP BY hour
      ORDER BY hour`,
    )
    .all();
}

export async function getStatsByModel() {
  return db
    .prepare(
      `SELECT
        model,
        COUNT(*) AS total_requests,
        COALESCE(SUM(cost_usd), 0) AS total_cost,
        COALESCE(AVG(latency_ms), 0) AS avg_latency
      FROM request_logs
      WHERE model != ''
      GROUP BY model`,
    )
    .all();
}
