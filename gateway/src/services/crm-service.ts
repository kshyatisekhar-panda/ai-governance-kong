import { db } from "./logger.js";

export type CaseStatus = "New" | "In Progress" | "Pending Customer" | "Resolved" | "Closed";
export type CasePriority = "Low" | "Medium" | "High" | "Critical";
export type AiTriageStatus = "Pending" | "Completed" | "Failed" | "Skipped";

export interface ServiceCaseInput {
  customerName: string;
  email: string;
  phone: string;
  company: string;
  country: string;
  region: string;
  product: string;
  serialNumber?: string;
  issueCategory: string;
  urgency: string;
  preferredContactChannel: string;
  issueDescription: string;
  sourceChannel?: string;
}

export interface ServiceCase {
  id: number;
  caseNumber: string;
  sourceChannel: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  company: string;
  country: string;
  region: string;
  product: string;
  serialNumber: string | null;
  issueCategory: string;
  urgency: string;
  preferredContactChannel: string;
  issueDescription: string;
  status: CaseStatus;
  priority: CasePriority;
  assignedTeam: string;
  aiTriageStatus: AiTriageStatus;
  aiSummary: string | null;
  aiSuggestedReply: string | null;
  aiRouteTo: string | null;
  aiBusinessImpact: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TriageResult {
  priority: CasePriority;
  category: string;
  routeTo: string;
  businessImpact: string;
  summary: string;
  suggestedReply: string;
  confidence: number;
}

interface CaseRow {
  id: number;
  case_number: string;
  source_channel: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  company: string;
  country: string;
  region: string;
  product: string;
  serial_number: string | null;
  issue_category: string;
  urgency: string;
  preferred_contact_channel: string;
  issue_description: string;
  status: string;
  priority: string;
  assigned_team: string;
  ai_triage_status: string;
  ai_summary: string | null;
  ai_suggested_reply: string | null;
  ai_route_to: string | null;
  ai_business_impact: string | null;
  created_at: string;
  updated_at: string;
}

function rowToCase(r: CaseRow): ServiceCase {
  return {
    id: r.id,
    caseNumber: r.case_number,
    sourceChannel: r.source_channel,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    company: r.company,
    country: r.country,
    region: r.region,
    product: r.product,
    serialNumber: r.serial_number,
    issueCategory: r.issue_category,
    urgency: r.urgency,
    preferredContactChannel: r.preferred_contact_channel,
    issueDescription: r.issue_description,
    status: r.status as CaseStatus,
    priority: r.priority as CasePriority,
    assignedTeam: r.assigned_team,
    aiTriageStatus: r.ai_triage_status as AiTriageStatus,
    aiSummary: r.ai_summary,
    aiSuggestedReply: r.ai_suggested_reply,
    aiRouteTo: r.ai_route_to,
    aiBusinessImpact: r.ai_business_impact,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function priorityFromUrgency(urgency: string): CasePriority {
  const u = urgency.toLowerCase();
  if (u.includes("critical")) return "Critical";
  if (u.includes("high")) return "High";
  if (u.includes("low")) return "Low";
  return "Medium";
}

function nextCaseNumber(): string {
  const row = db.prepare("SELECT COUNT(*) AS c FROM service_cases").get() as { c: number };
  const n = row.c + 1001;
  return `AC-${n}`;
}

export function createCase(input: ServiceCaseInput): ServiceCase {
  const caseNumber = nextCaseNumber();
  const priority = priorityFromUrgency(input.urgency);
  const result = db
    .prepare(
      `INSERT INTO service_cases (
        case_number, source_channel, customer_name, customer_email, customer_phone,
        company, country, region, product, serial_number,
        issue_category, urgency, preferred_contact_channel, issue_description,
        priority
      ) VALUES (
        @caseNumber, @sourceChannel, @customerName, @email, @phone,
        @company, @country, @region, @product, @serialNumber,
        @issueCategory, @urgency, @preferredContactChannel, @issueDescription,
        @priority
      )`,
    )
    .run({
      caseNumber,
      sourceChannel: input.sourceChannel ?? "Service Case Form",
      customerName: input.customerName,
      email: input.email,
      phone: input.phone,
      company: input.company,
      country: input.country,
      region: input.region,
      product: input.product,
      serialNumber: input.serialNumber ?? null,
      issueCategory: input.issueCategory,
      urgency: input.urgency,
      preferredContactChannel: input.preferredContactChannel,
      issueDescription: input.issueDescription,
      priority,
    });

  const row = db
    .prepare("SELECT * FROM service_cases WHERE id = ?")
    .get(result.lastInsertRowid) as CaseRow;
  return rowToCase(row);
}

export function getCaseById(id: number): ServiceCase | null {
  const row = db
    .prepare("SELECT * FROM service_cases WHERE id = ?")
    .get(id) as CaseRow | undefined;
  return row ? rowToCase(row) : null;
}

export interface ListCasesQuery {
  status?: string;
  priority?: string;
  product?: string;
  region?: string;
  aiTriageStatus?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function listCases(query: ListCasesQuery): { cases: ServiceCase[]; total: number } {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (query.status) { where.push("status = @status"); params.status = query.status; }
  if (query.priority) { where.push("priority = @priority"); params.priority = query.priority; }
  if (query.product) { where.push("product = @product"); params.product = query.product; }
  if (query.region) { where.push("region = @region"); params.region = query.region; }
  if (query.aiTriageStatus) { where.push("ai_triage_status = @aiTriageStatus"); params.aiTriageStatus = query.aiTriageStatus; }
  if (query.search) {
    where.push(
      "(case_number LIKE @search OR customer_name LIKE @search OR company LIKE @search OR product LIKE @search OR issue_description LIKE @search)",
    );
    params.search = `%${query.search}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM service_cases ${whereSql}`)
    .get(params) as { c: number };

  const rows = db
    .prepare(
      `SELECT * FROM service_cases ${whereSql}
       ORDER BY datetime(created_at) DESC
       LIMIT ${limit} OFFSET ${offset}`,
    )
    .all(params) as CaseRow[];

  return { cases: rows.map(rowToCase), total: totalRow.c };
}

export function applyTriage(
  caseId: number,
  triage: TriageResult,
  status: "Completed" | "Failed" = "Completed",
): ServiceCase | null {
  db.prepare(
    `UPDATE service_cases SET
       priority = @priority,
       assigned_team = @routeTo,
       ai_triage_status = @triageStatus,
       ai_summary = @summary,
       ai_suggested_reply = @suggestedReply,
       ai_route_to = @routeTo,
       ai_business_impact = @businessImpact,
       updated_at = datetime('now')
     WHERE id = @id`,
  ).run({
    id: caseId,
    priority: triage.priority,
    routeTo: triage.routeTo,
    triageStatus: status,
    summary: triage.summary,
    suggestedReply: triage.suggestedReply,
    businessImpact: triage.businessImpact,
  });
  return getCaseById(caseId);
}

export function setSuggestedReply(caseId: number, reply: string): void {
  db.prepare(
    "UPDATE service_cases SET ai_suggested_reply = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(reply, caseId);
}
