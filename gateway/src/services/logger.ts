import Database from "better-sqlite3";
import { config } from "../config.js";
import { seedDatabase } from "./seed.js";
import type { RequestLogEntry, SocEvent } from "../types.js";

const db = new Database(config.sqlitePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
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
  );

  CREATE TABLE IF NOT EXISTS service_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT UNIQUE NOT NULL,
    source_channel TEXT DEFAULT 'Service Case Form',
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    company TEXT NOT NULL,
    country TEXT NOT NULL,
    region TEXT NOT NULL,
    product TEXT NOT NULL,
    serial_number TEXT,
    issue_category TEXT NOT NULL,
    urgency TEXT NOT NULL,
    preferred_contact_channel TEXT NOT NULL,
    issue_description TEXT NOT NULL,
    status TEXT DEFAULT 'New',
    priority TEXT DEFAULT 'Medium',
    assigned_team TEXT DEFAULT 'Customer Service',
    ai_triage_status TEXT DEFAULT 'Pending',
    ai_summary TEXT,
    ai_suggested_reply TEXT,
    ai_route_to TEXT,
    ai_business_impact TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS soc_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE,
    timestamp TEXT,
    layer TEXT,
    decision TEXT,
    block_reason TEXT,
    method TEXT,
    path TEXT,
    client_ip TEXT,
    consumer TEXT,
    route_name TEXT,
    model TEXT,
    llm_called INTEGER,
    datapoints_json TEXT
  );
`);

  CREATE TABLE IF NOT EXISTS soc_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE,
    timestamp TEXT,
    layer TEXT,
    decision TEXT,
    block_reason TEXT,
    method TEXT,
    path TEXT,
    client_ip TEXT,
    consumer TEXT,
    route_name TEXT,
    model TEXT,
    llm_called INTEGER,
    datapoints_json TEXT
  );
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

const insertSocEventStmt = db.prepare(`
  INSERT INTO soc_events
    (event_id, timestamp, layer, decision, block_reason, method, path, client_ip, consumer, route_name, model, llm_called, datapoints_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export async function logSocEvent(event: SocEvent): Promise<void> {
  try {
    insertSocEventStmt.run(
      event.eventId,
      event.timestamp,
      event.layer,
      event.decision,
      event.blockReason,
      event.method,
      event.path,
      event.clientIp,
      event.consumer,
      event.routeName,
      event.model,
      event.llmCalled ? 1 : 0,
      JSON.stringify(event.datapoints)
    );
  } catch (error) {
    console.error("[logger] Failed to write soc event:", error);
  }
}

export async function getSocEvents(limit = 100): Promise<SocEvent[]> {
  const rows = db.prepare("SELECT * FROM soc_events ORDER BY timestamp DESC LIMIT ?").all(limit) as any[];
  return rows.map((r) => ({
    eventId: r.event_id,
    timestamp: r.timestamp,
    layer: r.layer,
    decision: r.decision,
    blockReason: r.block_reason,
    method: r.method,
    path: r.path,
    clientIp: r.client_ip,
    consumer: r.consumer,
    routeName: r.route_name,
    model: r.model,
    llmCalled: r.llm_called === 1,
    datapoints: JSON.parse(r.datapoints_json || "{}")
  }));
}

export async function clearAllLogs(): Promise<void> {
  db.exec("DELETE FROM request_logs");
  db.exec("DELETE FROM soc_events");
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
      WHERE date(timestamp) = date('now', 'localtime')
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
  // Try hourly buckets for last 24h first
  const hourly = db
    .prepare(
      `SELECT
        strftime('%Y-%m-%d %H:00', timestamp) AS hour,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS allowed,
        SUM(CASE WHEN status = 'masked' THEN 1 ELSE 0 END) AS masked,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked
      FROM request_logs
      WHERE timestamp >= datetime('now', 'localtime', '-24 hours')
      GROUP BY hour
      ORDER BY hour`,
    )
    .all();

  if (hourly.length > 0) return hourly;

  // Fallback: group by day for all data
  return db
    .prepare(
      `SELECT
        strftime('%Y-%m-%d', timestamp) AS hour,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS allowed,
        SUM(CASE WHEN status = 'masked' THEN 1 ELSE 0 END) AS masked,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked
      FROM request_logs
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
