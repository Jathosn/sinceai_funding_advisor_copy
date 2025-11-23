import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDirectory = path.join(__dirname, "..", "data");
const dbPath = path.join(dbDirectory, "app.db");

fs.mkdirSync(dbDirectory, { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// Schema setup
db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL,
  business_id          TEXT,
  website_url          TEXT,
  country              TEXT DEFAULT 'FI',
  city                 TEXT,

  industry_code        TEXT,
  industry_text        TEXT,

  employee_count       INTEGER,
  employee_range       TEXT,

  revenue_eur          REAL,
  revenue_range        TEXT,

  stage                TEXT,
  funding_need_type    TEXT,
  funding_need_min_eur REAL,
  funding_need_max_eur REAL,
  funding_need_summary TEXT,

  description          TEXT,

  tags                 TEXT,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_name
  ON companies(name);

CREATE INDEX IF NOT EXISTS idx_companies_business_id
  ON companies(business_id);

CREATE INDEX IF NOT EXISTS idx_companies_stage
  ON companies(stage);

CREATE INDEX IF NOT EXISTS idx_companies_funding_need_type
  ON companies(funding_need_type);

CREATE TABLE IF NOT EXISTS company_cases (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id             INTEGER NOT NULL,
  case_title             TEXT,
  created_at             DATETIME DEFAULT CURRENT_TIMESTAMP,

  stage                  TEXT,
  funding_need_type      TEXT,
  funding_need_min_eur   REAL,
  funding_need_max_eur   REAL,
  funding_need_details   TEXT,
  extra_input_json       TEXT,

  company_summary_text   TEXT,
  debug_request_payload  TEXT,
  debug_response_payload TEXT,

  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_company_cases_company
  ON company_cases(company_id);

CREATE INDEX IF NOT EXISTS idx_company_cases_created_at
  ON company_cases(created_at);

CREATE INDEX IF NOT EXISTS idx_company_cases_stage
  ON company_cases(stage);

CREATE INDEX IF NOT EXISTS idx_company_cases_funding_need_type
  ON company_cases(funding_need_type);

CREATE TABLE IF NOT EXISTS recommendations (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id            INTEGER NOT NULL,
  kind               TEXT NOT NULL,

  name               TEXT NOT NULL,
  provider           TEXT,
  url                TEXT,

  stage_match        TEXT,
  funding_type       TEXT,
  instrument_category TEXT,
  min_amount_eur     REAL,
  max_amount_eur     REAL,
  geography_focus    TEXT,
  sector_focus       TEXT,

  score              REAL,
  rank               INTEGER,
  explanation_text   TEXT,
  raw_metadata_json  TEXT,

  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (case_id) REFERENCES company_cases(id)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_case
  ON recommendations(case_id);

CREATE INDEX IF NOT EXISTS idx_recommendations_kind
  ON recommendations(kind);

CREATE INDEX IF NOT EXISTS idx_recommendations_rank
  ON recommendations(case_id, rank);

CREATE TABLE IF NOT EXISTS investor_reports (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id       INTEGER NOT NULL,
  company_name     TEXT NOT NULL,
  recommendation   TEXT NOT NULL,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_investor_reports_company
  ON investor_reports(company_id);

CREATE TABLE IF NOT EXISTS investor_report_changes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id   INTEGER NOT NULL,
  json_path   TEXT NOT NULL,
  from_value  TEXT,
  to_value    TEXT,
  changed_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES investor_reports(id)
);

CREATE INDEX IF NOT EXISTS idx_investor_report_changes_report
  ON investor_report_changes(report_id);

CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL,
  case_id     INTEGER NOT NULL,
  action      TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (case_id) REFERENCES company_cases(id)
);

CREATE INDEX IF NOT EXISTS idx_history_company
  ON history(company_id);

CREATE INDEX IF NOT EXISTS idx_history_created_at
  ON history(created_at);
`);

// Lightweight migration for older databases that may not yet have the description column
try {
  db.exec("ALTER TABLE companies ADD COLUMN description TEXT");
  // eslint-disable-next-line no-empty
} catch (e) {}

// Track manual edits log per company
try {
  db.exec("ALTER TABLE companies ADD COLUMN manual_change_log TEXT");
  // eslint-disable-next-line no-empty
} catch (e) {}

const selectCompanyByNameStmt = db.prepare(
  "SELECT id FROM companies WHERE name = ?"
);

const selectCompanyByIdStmt = db.prepare("SELECT * FROM companies WHERE id = ?");

const insertCompanyStmt = db.prepare(
  "INSERT INTO companies (name) VALUES (?)"
);

const updateCompanyFromMetricsStmt = db.prepare(
  `UPDATE companies SET
    business_id          = COALESCE(@business_id, business_id),
    website_url          = COALESCE(@website_url, website_url),
    country              = COALESCE(@country, country),
    city                 = COALESCE(@city, city),
    industry_code        = COALESCE(@industry_code, industry_code),
    industry_text        = COALESCE(@industry_text, industry_text),
    employee_count       = COALESCE(@employee_count, employee_count),
    employee_range       = COALESCE(@employee_range, employee_range),
    revenue_eur          = COALESCE(@revenue_eur, revenue_eur),
    revenue_range        = COALESCE(@revenue_range, revenue_range),
    stage                = COALESCE(@stage, stage),
    funding_need_type    = COALESCE(@funding_need_type, funding_need_type),
    funding_need_min_eur = COALESCE(@funding_need_min_eur, funding_need_min_eur),
    funding_need_max_eur = COALESCE(@funding_need_max_eur, funding_need_max_eur),
    funding_need_summary = COALESCE(@funding_need_summary, funding_need_summary),
    description          = COALESCE(@description, description),
    updated_at           = CURRENT_TIMESTAMP
  WHERE id = @id`
);

const insertCaseStmt = db.prepare(
  `INSERT INTO company_cases (
    company_id,
    case_title,
    stage,
    funding_need_type,
    funding_need_min_eur,
    funding_need_max_eur,
    funding_need_details,
    extra_input_json,
    company_summary_text
  ) VALUES (
    @company_id,
    @case_title,
    @stage,
    @funding_need_type,
    @funding_need_min_eur,
    @funding_need_max_eur,
    @funding_need_details,
    @extra_input_json,
    @company_summary_text
  )`
);

const insertRecommendationStmt = db.prepare(
  `INSERT INTO recommendations (
    case_id,
    kind,
    name,
    provider,
    url,
    stage_match,
    funding_type,
    instrument_category,
    min_amount_eur,
    max_amount_eur,
    geography_focus,
    sector_focus,
    score,
    rank,
    explanation_text,
    raw_metadata_json
  ) VALUES (
    @case_id,
    @kind,
    @name,
    @provider,
    @url,
    @stage_match,
    @funding_type,
    @instrument_category,
    @min_amount_eur,
    @max_amount_eur,
    @geography_focus,
    @sector_focus,
    @score,
    @rank,
    @explanation_text,
    @raw_metadata_json
  )`
);

const insertHistoryStmt = db.prepare(
  `INSERT INTO history (company_id, case_id, action)
   VALUES (@company_id, @case_id, @action)`
);

const insertInvestorReportStmt = db.prepare(
  `INSERT INTO investor_reports (company_id, company_name, recommendation)
   VALUES (@company_id, @company_name, @recommendation)`
);

const selectCompanyProfileByIdStmt = db.prepare(
  `SELECT
    c.id AS company_id,
    c.name AS company_name,
    c.business_id,
    c.website_url,
    c.country,
    c.city,
    c.industry_code,
    c.industry_text,
    c.employee_count,
    c.employee_range,
    c.revenue_eur,
    c.revenue_range,
    c.stage,
    c.funding_need_type,
    c.funding_need_min_eur,
    c.funding_need_max_eur,
    c.funding_need_summary,
    c.description,
    cc.company_summary_text,
    cc.created_at AS latest_case_created_at
  FROM companies c
  LEFT JOIN company_cases cc ON cc.company_id = c.id
  WHERE c.id = ?
  ORDER BY cc.created_at IS NULL, cc.created_at DESC
  LIMIT 1`
);

const selectInvestorReportByIdStmt = db.prepare(
  `SELECT
    id,
    company_id,
    company_name,
    recommendation
  FROM investor_reports
  WHERE id = ?`
);

const updateInvestorReportStmt = db.prepare(
  `UPDATE investor_reports
   SET recommendation = @recommendation
   WHERE id = @id`
);

const insertInvestorReportChangeStmt = db.prepare(
  `INSERT INTO investor_report_changes (
    report_id,
    json_path,
    from_value,
    to_value
  ) VALUES (
    @report_id,
    @json_path,
    @from_value,
    @to_value
  )`
);

const selectInvestorReportChangesStmt = db.prepare(
  `SELECT
    json_path,
    from_value,
    to_value,
    changed_at
  FROM investor_report_changes
  WHERE report_id = ?
  ORDER BY changed_at DESC`
);

const selectRecentInvestorReportsStmt = db.prepare(
  `SELECT
    ir.id AS report_id,
    ir.company_id,
    ir.company_name,
    ir.recommendation,
    ir.created_at
  FROM investor_reports ir
  ORDER BY ir.created_at DESC
  LIMIT ?`
);

const selectRecentCasesStmt = db.prepare(
  `SELECT
    cc.id AS case_id,
    cc.company_id,
    cc.case_title,
    cc.company_summary_text,
    cc.created_at,
    c.name AS company_name,
    c.business_id,
    c.website_url,
    c.country,
    c.city,
    c.industry_code,
    c.industry_text,
    c.employee_count,
    c.employee_range,
    c.revenue_eur,
    c.revenue_range,
    c.stage,
    c.funding_need_type,
    c.funding_need_min_eur,
    c.funding_need_max_eur,
    c.funding_need_summary,
    c.description,
    c.manual_change_log
  FROM company_cases cc
  JOIN companies c ON cc.company_id = c.id
  ORDER BY cc.created_at DESC
  LIMIT ?`
);

const MANUAL_FIELD_NAME_MAP = new Map([
  ["funding_need_type_guess", "funding_need_type"],
  ["funding_need_min_eur_guess", "funding_need_min_eur"],
  ["funding_need_max_eur_guess", "funding_need_max_eur"],
  ["funding_need_summary_guess", "funding_need_summary"]
]);

const MANUAL_EDITABLE_COLUMNS = new Set([
  "name",
  "business_id",
  "website_url",
  "country",
  "city",
  "industry_code",
  "industry_text",
  "employee_count",
  "employee_range",
  "revenue_eur",
  "revenue_range",
  "stage",
  "funding_need_type",
  "funding_need_min_eur",
  "funding_need_max_eur",
  "funding_need_summary",
  "description",
  "tags"
]);

const MANUAL_NUMERIC_COLUMNS = new Set([
  "employee_count",
  "revenue_eur",
  "funding_need_min_eur",
  "funding_need_max_eur"
]);

function resolveManualColumn(field) {
  if (MANUAL_FIELD_NAME_MAP.has(field)) {
    return MANUAL_FIELD_NAME_MAP.get(field);
  }

  return MANUAL_EDITABLE_COLUMNS.has(field) ? field : null;
}

function coerceManualValue(column, rawValue) {
  if (rawValue === undefined) {
    return { shouldPersist: false };
  }

  if (rawValue === null) {
    return { shouldPersist: true, value: null };
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return { shouldPersist: true, value: null };
    }

    if (MANUAL_NUMERIC_COLUMNS.has(column)) {
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) {
        return {
          shouldPersist: false,
          error: `Invalid numeric value for ${column}`
        };
      }
      return { shouldPersist: true, value: numeric };
    }

    return { shouldPersist: true, value: trimmed };
  }

  if (typeof rawValue === "number") {
    if (MANUAL_NUMERIC_COLUMNS.has(column)) {
      return { shouldPersist: true, value: rawValue };
    }
    return { shouldPersist: true, value: rawValue.toString() };
  }

  return { shouldPersist: true, value: rawValue };
}

function parseManualLog(rawLog) {
  if (!rawLog) return [];
  try {
    const parsed = JSON.parse(rawLog);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[db] Failed to parse manual_change_log JSON:", error);
    return [];
  }
}

export function applyManualCompanyUpdates({ companyId, updates }) {
  if (!Number.isInteger(Number(companyId))) {
    throw new Error("Valid companyId is required");
  }

  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("updates payload must be an object");
  }

  const numericId = Number(companyId);
  const existingRow = selectCompanyByIdStmt.get(numericId);
  if (!existingRow) {
    const error = new Error("Company not found");
    error.statusCode = 404;
    throw error;
  }

  const changes = [];
  const updatePayload = {};
  const validationErrors = [];
  const timestamp = new Date().toISOString();

  for (const [field, rawValue] of Object.entries(updates)) {
    const columnName = resolveManualColumn(field);
    if (!columnName) continue;

    const { shouldPersist, value, error } = coerceManualValue(
      columnName,
      rawValue
    );

    if (error) {
      validationErrors.push(error);
      continue;
    }

    if (!shouldPersist) continue;

    const previousValue = existingRow[columnName];
    const normalizedPrevious =
      previousValue === undefined ? null : previousValue;

    const isSame =
      (normalizedPrevious === null || normalizedPrevious === undefined) &&
      (value === null || value === undefined)
        ? true
        : normalizedPrevious === value;

    if (isSame) continue;

    updatePayload[columnName] = value;
    changes.push({
      column: columnName,
      from: normalizedPrevious ?? null,
      to: value ?? null,
      changedAt: timestamp
    });
  }

  if (validationErrors.length > 0) {
    const validationError = new Error(validationErrors.join("; "));
    validationError.statusCode = 400;
    throw validationError;
  }

  if (Object.keys(updatePayload).length === 0) {
    return {
      updated: false,
      message: "No changes detected",
      manualChangeLog: parseManualLog(existingRow.manual_change_log)
    };
  }

  const baseLog = parseManualLog(existingRow.manual_change_log);
  const updatedLog = [...baseLog, ...changes];
  updatePayload.manual_change_log = JSON.stringify(updatedLog);

  const setFragments = Object.keys(updatePayload).map(
    (column) => `${column} = @${column}`
  );
  setFragments.push("updated_at = CURRENT_TIMESTAMP");

  const sql = `UPDATE companies SET ${setFragments.join(
    ", "
  )} WHERE id = @company_id_target`;

  const stmt = db.prepare(sql);
  stmt.run({ company_id_target: numericId, ...updatePayload });

  return {
    updated: true,
    changes,
    manualChangeLog: updatedLog,
    message: `${changes.length} field(s) updated`
  };
}

function getOrCreateCompanyIdByName(name) {
  const trimmed = name.trim();
  const existing = selectCompanyByNameStmt.get(trimmed);
  if (existing) return existing.id;

  const result = insertCompanyStmt.run(trimmed);
  return result.lastInsertRowid;
}

function updateCompanyWithMetrics(companyId, metrics) {
  if (!metrics || typeof metrics !== "object") return;

  const payload = {
    id: companyId,
    business_id: metrics.business_id ?? null,
    website_url: metrics.website_url ?? null,
    country: metrics.country ?? null,
    city: metrics.city ?? null,
    industry_code: metrics.industry_code ?? null,
    industry_text: metrics.industry_text ?? null,
    employee_count: metrics.employee_count ?? null,
    employee_range: metrics.employee_range ?? null,
    revenue_eur: metrics.revenue_eur ?? null,
    revenue_range: metrics.revenue_range ?? null,
    stage: metrics.stage ?? null,
    funding_need_type: metrics.funding_need_type_guess ?? null,
    funding_need_min_eur: metrics.funding_need_min_eur_guess ?? null,
    funding_need_max_eur: metrics.funding_need_max_eur_guess ?? null,
    funding_need_summary: metrics.funding_need_summary_guess ?? null,
    description: metrics.description ?? null
  };

  updateCompanyFromMetricsStmt.run(payload);
}

function recordHistory({ companyId, caseId, action }) {
  insertHistoryStmt.run({
    company_id: companyId,
    case_id: caseId,
    action
  });
}

export function recordInvestorReport({ companyId, companyName, recommendation }) {
  insertInvestorReportStmt.run({
    company_id: companyId,
    company_name: companyName,
    recommendation: JSON.stringify(recommendation)
  });
}

function insertDemoRecommendations(caseId, type) {
  const isDetailed = type === "detailed";

  const recommendations = [];

  recommendations.push({
    case_id: caseId,
    kind: "funding_program",
    name: "Example public R&D funding programme (demo)",
    provider: "Business Finland (demo)",
    url: "https://www.businessfinland.fi/",
    stage_match: null,
    funding_type: "grant",
    instrument_category: "national",
    min_amount_eur: 50000,
    max_amount_eur: 500000,
    geography_focus: "FI",
    sector_focus: "general innovation",
    score: 0.8,
    rank: 1,
    explanation_text:
      "Demo recommendation: in the real system this would represent a specific public funding instrument that matches the company profile.",
    raw_metadata_json: null
  });

  if (isDetailed) {
    recommendations.push({
      case_id: caseId,
      kind: "investor",
      name: "Example Nordic VC fund (demo)",
      provider: "Demo Capital Partners",
      url: "https://example-vc.demo/",
      stage_match: "seed",
      funding_type: "equity",
      instrument_category: "private",
      min_amount_eur: 250000,
      max_amount_eur: 2000000,
      geography_focus: "Nordic",
      sector_focus: "technology, digital",
      score: 0.75,
      rank: 2,
      explanation_text:
        "Demo investor recommendation: in the real system, investors would be filtered and ranked based on stage, ticket size and sector focus.",
      raw_metadata_json: null
    });
  }

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertRecommendationStmt.run(item);
    }
  });

  insertMany(recommendations);
}

export function recordBasicCase({ companyName, summary, metrics, rawInput }) {
  const companyId = getOrCreateCompanyIdByName(companyName);

  updateCompanyWithMetrics(companyId, metrics);

  const caseInfo = {
    company_id: companyId,
    case_title: "Quick lookup",
    stage: null,
    funding_need_type: null,
    funding_need_min_eur: null,
    funding_need_max_eur: null,
    funding_need_details: null,
    extra_input_json: rawInput ? JSON.stringify(rawInput) : null,
    company_summary_text: summary
  };

  const result = insertCaseStmt.run(caseInfo);
  const caseId = result.lastInsertRowid;

  insertDemoRecommendations(caseId, "basic");

  recordHistory({ companyId, caseId, action: "summary-basic" });

  return { companyId, caseId };
}

export function recordDetailedCase({
  companyName,
  summary,
  metrics,
  extraInfo,
  rawInput
}) {
  const companyId = getOrCreateCompanyIdByName(companyName);

  updateCompanyWithMetrics(companyId, metrics);

  const caseInfo = {
    company_id: companyId,
    case_title: "Detailed profile",
    stage: null,
    funding_need_type: null,
    funding_need_min_eur: null,
    funding_need_max_eur: null,
    funding_need_details: extraInfo || null,
    extra_input_json: rawInput ? JSON.stringify(rawInput) : null,
    company_summary_text: summary
  };

  const result = insertCaseStmt.run(caseInfo);
  const caseId = result.lastInsertRowid;

  insertDemoRecommendations(caseId, "detailed");

  recordHistory({ companyId, caseId, action: "summary-detailed" });

  return { companyId, caseId };
}

function shapeMetricsFromRow(row) {
  if (!row) return null;

  return {
    name: row.company_name,
    business_id: row.business_id,
    website_url: row.website_url,
    country: row.country,
    city: row.city,
    industry_code: row.industry_code,
    industry_text: row.industry_text,
    employee_count: row.employee_count,
    employee_range: row.employee_range,
    revenue_eur: row.revenue_eur,
    revenue_range: row.revenue_range,
    stage: row.stage,
    funding_need_type_guess: row.funding_need_type,
    funding_need_min_eur_guess: row.funding_need_min_eur,
    funding_need_max_eur_guess: row.funding_need_max_eur,
    funding_need_summary_guess: row.funding_need_summary,
    description: row.description,
    summary: row.company_summary_text || row.description || null
  };
}

export function getRecentCompanyHistory(limit = 20) {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), 100)
    : 20;

  const caseRows = selectRecentCasesStmt.all(safeLimit);
  const reportRows = selectRecentInvestorReportsStmt.all(safeLimit);

  const mappedCases = caseRows.map((row) => ({
    entryType: "lookup",
    caseId: row.case_id,
    companyId: row.company_id,
    companyName: row.company_name,
    createdAt: row.created_at,
    summary: row.company_summary_text,
    metrics: shapeMetricsFromRow(row),
    manualChangeLog: parseManualLog(row.manual_change_log)
  }));

  const mappedReports = reportRows.map((row) => {
    let recommendation = null;
    try {
      recommendation = JSON.parse(row.recommendation);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("[db] Failed to parse investor recommendation JSON:", error);
    }

    return {
      entryType: "investment_report",
      reportId: row.report_id,
      companyId: row.company_id,
      companyName: row.company_name,
      createdAt: row.created_at,
    investmentReport: recommendation,
    manualChangeLog: selectInvestorReportChanges(row.report_id)
    };
  });

  const combined = [...mappedCases, ...mappedReports];
  combined.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return combined.slice(0, safeLimit);
}

export function getCompanyProfileById(companyId) {
  const row = selectCompanyProfileByIdStmt.get(companyId);
  if (!row) return null;

  return {
    companyId: row.company_id,
    createdAt: row.latest_case_created_at,
    metrics: shapeMetricsFromRow(row)
  };
}

function selectInvestorReportChanges(reportId) {
  return selectInvestorReportChangesStmt.all(reportId).map((row) => ({
    jsonPath: row.json_path,
    fromValue: row.from_value,
    toValue: row.to_value,
    changedAt: row.changed_at
  }));
}

function flattenJsonValue(value, path = "$", acc = new Map()) {
  if (value === undefined) {
    acc.set(path, "undefined");
    return acc;
  }

  if (value === null) {
    acc.set(path, "null");
    return acc;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      acc.set(path, "[]");
      return acc;
    }
    value.forEach((item, index) => {
      flattenJsonValue(item, `${path}[${index}]`, acc);
    });
    return acc;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      acc.set(path, "{}");
      return acc;
    }
    keys.forEach((key) => {
      const nextPath = path === "$" ? `$.${key}` : `${path}.${key}`;
      flattenJsonValue(value[key], nextPath, acc);
    });
    return acc;
  }

  acc.set(path, JSON.stringify(value));
  return acc;
}

function diffRecommendationPayloads(currentPayload, nextPayload) {
  const currentFlat = flattenJsonValue(currentPayload);
  const nextFlat = flattenJsonValue(nextPayload);

  const allPaths = new Set([
    ...currentFlat.keys(),
    ...nextFlat.keys()
  ]);

  const changes = [];
  for (const path of allPaths) {
    const before = currentFlat.has(path) ? currentFlat.get(path) : "undefined";
    const after = nextFlat.has(path) ? nextFlat.get(path) : "undefined";
    if (before === after) continue;

    changes.push({
      jsonPath: path,
      fromValue: before,
      toValue: after
    });
  }

  return changes;
}

export function applyManualInvestorReportUpdates({ reportId, recommendation }) {
  if (!Number.isInteger(Number(reportId))) {
    throw new Error("Valid reportId is required");
  }

  if (!recommendation || typeof recommendation !== "object") {
    throw new Error("recommendation payload must be an object");
  }

  const numericId = Number(reportId);
  const existing = selectInvestorReportByIdStmt.get(numericId);
  if (!existing) {
    const error = new Error("Investor report not found");
    error.statusCode = 404;
    throw error;
  }

  let parsedExisting = null;
  try {
    parsedExisting = JSON.parse(existing.recommendation);
  } catch (error) {
    parsedExisting = {};
  }

  const changes = diffRecommendationPayloads(parsedExisting, recommendation);
  if (changes.length === 0) {
    return {
      updated: false,
      message: "No changes detected",
      manualChangeLog: selectInvestorReportChanges(numericId),
      recommendation: parsedExisting
    };
  }

  const updateRecommendation = JSON.stringify(recommendation);
  updateInvestorReportStmt.run({
    id: numericId,
    recommendation: updateRecommendation
  });

  const insertMany = db.transaction((items) => {
    for (const change of items) {
      insertInvestorReportChangeStmt.run({
        report_id: numericId,
        json_path: change.jsonPath,
        from_value: change.fromValue,
        to_value: change.toValue
      });
    }
  });
  insertMany(changes);

  return {
    updated: true,
    changes,
    manualChangeLog: selectInvestorReportChanges(numericId),
    recommendation
  };
}
