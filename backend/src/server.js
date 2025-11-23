import express from "express";
import cors from "cors";
import {
  recordBasicCase,
  recordDetailedCase,
  getRecentCompanyHistory,
  getCompanyProfileById,
  recordInvestorReport,
  applyManualCompanyUpdates,
  applyManualInvestorReportUpdates
} from "./db.js";
import { recommendInvestorsForCompany } from "./investorAdvisor.js";
import { inferCompanyBaseMetrics } from "./companyEnrichment.js";

const app = express();
const port = process.env.PORT || 4000;

function respondIfAgentMissing(res, error) {
  if (error?.code === "MISSING_LOOKUP_AGENT") {
    res.status(500).json({
      error: "Missing LOOKUP_AGENT configuration",
      details: "Set LOOKUP_AGENT in backend/.env to enable company lookup."
    });
    return true;
  }

  if (error?.code === "MISSING_FUNDING_ADVISOR_AGENT") {
    res.status(500).json({
      error: "Missing FUNDING_ADVISOR_AGENT configuration",
      details: "Set FUNDING_ADVISOR_AGENT in backend/.env to enable investor match."
    });
    return true;
  }

  return false;
}

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);

app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Basic company summary – uses OpenAI GPT-5.1 reasoning for enrichment
app.post("/api/company/summary-basic", async (req, res) => {
  const { companyName } = req.body || {};

  if (!companyName || typeof companyName !== "string") {
    return res.status(400).json({ error: "companyName is required" });
  }

  const cleanedName = companyName.trim();

  try {
    const { metrics, raw } = await inferCompanyBaseMetrics(cleanedName);
    const summary = metrics.summary || `Basic information for company ${cleanedName}.`;

    const { companyId, caseId } = recordBasicCase({
      companyName: cleanedName,
      summary,
      metrics,
      rawInput: {
        ...req.body,
        llmMetrics: metrics,
        llmRaw: raw
      }
    });

    res.json({
      companyName: cleanedName,
      summary,
      metrics,
      companyId,
      caseId,
      source: "openai-gpt-5.1"
    });
  } catch (error) {
    if (respondIfAgentMissing(res, error)) return;
    // eslint-disable-next-line no-console
    console.error("[api] /summary-basic failed:", error);
    res.status(500).json({ error: "Failed to enrich company information" });
  }
});

// Detailed company summary – uses the same GPT-5.1 reasoning model, including extraInfo
app.post("/api/company/summary-detailed", async (req, res) => {
  const { companyName, extraInfo } = req.body || {};

  if (!companyName || typeof companyName !== "string") {
    return res.status(400).json({ error: "companyName is required" });
  }

  const cleanedName = companyName.trim();
  const extra = typeof extraInfo === "string" ? extraInfo.trim() : "";

  try {
    const { metrics, raw } = await inferCompanyBaseMetrics(
      `${cleanedName} (${extra || "no extra context"})`
    );
    const summary =
      metrics.summary ||
      `Profile summary for company ${cleanedName} based on the provided context.`;

    const { companyId, caseId } = recordDetailedCase({
      companyName: cleanedName,
      summary,
      metrics,
      extraInfo: extra,
      rawInput: {
        ...req.body,
        llmMetrics: metrics,
        llmRaw: raw
      }
    });

    res.json({
      companyName: cleanedName,
      extraInfo: extra,
      summary,
      metrics,
      companyId,
      caseId,
      source: "openai-gpt-5.1"
    });
  } catch (error) {
    if (respondIfAgentMissing(res, error)) return;
    // eslint-disable-next-line no-console
    console.error("[api] /summary-detailed failed:", error);
    res.status(500).json({ error: "Failed to enrich company information" });
  }
});

app.get("/api/company/history", (req, res) => {
  const rawLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 20;

  try {
    const history = getRecentCompanyHistory(limit);
    res.json({ history });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api] /company/history failed:", error);
    res.status(500).json({
      error: "Failed to fetch company history",
      details: error?.message ?? "Unknown error"
    });
  }
});

app.post("/api/company/investor-match", async (req, res) => {
  const { companyId } = req.body || {};

  if (!companyId || Number.isNaN(Number(companyId))) {
    return res.status(400).json({ error: "companyId is required" });
  }

  try {
    const profile = getCompanyProfileById(companyId);
    if (!profile || !profile.metrics) {
      return res.status(404).json({ error: "Company not found" });
    }

    const recommendation = await recommendInvestorsForCompany(profile.metrics);
    recordInvestorReport({
      companyId,
      companyName: profile.metrics.name || profile.companyName || "Unknown company",
      recommendation
    });

    res.json({
      companyId,
      recommendation
    });
  } catch (error) {
    if (respondIfAgentMissing(res, error)) return;
    // eslint-disable-next-line no-console
    console.error("[api] /company/investor-match failed:", error);
    res.status(500).json({
      error: "Failed to generate investor recommendations",
      details: error?.message ?? "Unknown error"
    });
  }
});

app.post("/api/company/manual-validate", async (req, res) => {
  const { companyId, updates } = req.body || {};
  const numericCompanyId = Number(companyId);

  if (!Number.isInteger(numericCompanyId)) {
    return res.status(400).json({ error: "Valid companyId is required" });
  }

  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return res.status(400).json({ error: "updates payload must be an object" });
  }

  try {
    const result = applyManualCompanyUpdates({
      companyId: numericCompanyId,
      updates
    });
    const profile = getCompanyProfileById(numericCompanyId);

    res.json({
      ...result,
      metrics: profile?.metrics ?? null
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api] /manual-validate failed:", error);
    const status = error?.statusCode && Number.isInteger(error.statusCode)
      ? error.statusCode
      : 500;
    res.status(status).json({
      error:
        error?.statusCode === 400
          ? "Validation failed"
          : error?.statusCode === 404
            ? "Company not found"
            : "Failed to validate manual changes",
      details: error?.message ?? "Unknown error"
    });
  }
});

app.post("/api/investor-report/manual-validate", async (req, res) => {
  const { reportId, recommendation } = req.body || {};
  const numericReportId = Number(reportId);

  if (!Number.isInteger(numericReportId)) {
    return res.status(400).json({ error: "Valid reportId is required" });
  }

  if (!recommendation || typeof recommendation !== "object") {
    return res
      .status(400)
      .json({ error: "recommendation payload must be an object" });
  }

  try {
    const result = applyManualInvestorReportUpdates({
      reportId: numericReportId,
      recommendation
    });

    res.json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api] /investor-report/manual-validate failed:", error);
    const status = error?.statusCode && Number.isInteger(error.statusCode)
      ? error.statusCode
      : 500;
    res.status(status).json({
      error:
        error?.statusCode === 400
          ? "Validation failed"
          : error?.statusCode === 404
            ? "Investor report not found"
            : "Failed to validate investor report changes",
      details: error?.message ?? "Unknown error"
    });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend server listening on http://localhost:${port}`);
});


