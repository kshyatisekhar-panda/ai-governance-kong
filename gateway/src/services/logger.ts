import Database from "better-sqlite3";
import { config } from "../config.js";
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
