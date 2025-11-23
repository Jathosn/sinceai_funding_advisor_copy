import { useCallback, useEffect, useMemo, useState } from "react";

const HISTORY_LIMIT = 25;

const METRIC_LABELS = {
  business_id: "Business ID",
  website_url: "Website",
  country: "Country",
  city: "City",
  industry_text: "Industry",
  industry_code: "Industry code",
  employee_count: "Employees (approx.)",
  employee_range: "Employee range",
  revenue_eur: "Revenue (€)",
  revenue_range: "Revenue range",
  stage: "Stage",
  funding_need_type_guess: "Funding type",
  funding_need_min_eur_guess: "Funding min (€)",
  funding_need_max_eur_guess: "Funding max (€)",
  funding_need_summary_guess: "Funding summary"
};

const METRIC_SECTIONS = [
  {
    title: "Identity & Location",
    fields: [
      "business_id",
      "website_url",
      "country",
      "city",
      "industry_text",
      "industry_code"
    ]
  },
  {
    title: "Scale Indicators",
    fields: [
      "employee_count",
      "employee_range",
      "revenue_eur",
      "revenue_range",
      "stage"
    ]
  },
  {
    title: "Funding Outlook",
    fields: [
      "funding_need_type_guess",
      "funding_need_min_eur_guess",
      "funding_need_max_eur_guess",
      "funding_need_summary_guess"
    ]
  }
];

const DENSE_FIELDS = new Set(["funding_need_summary_guess"]);
const NUMERIC_FIELDS = new Set([
  "employee_count",
  "revenue_eur",
  "funding_need_min_eur_guess",
  "funding_need_max_eur_guess"
]);

const EDITABLE_FIELDS = METRIC_SECTIONS.flatMap((section) => section.fields);

const formatRecommendationJson = (recommendation) =>
  JSON.stringify(recommendation ?? {}, null, 2);

const FIELD_COLUMN_MAP = {
  business_id: "business_id",
  website_url: "website_url",
  country: "country",
  city: "city",
  industry_text: "industry_text",
  industry_code: "industry_code",
  employee_count: "employee_count",
  employee_range: "employee_range",
  revenue_eur: "revenue_eur",
  revenue_range: "revenue_range",
  stage: "stage",
  funding_need_type_guess: "funding_need_type",
  funding_need_min_eur_guess: "funding_need_min_eur",
  funding_need_max_eur_guess: "funding_need_max_eur",
  funding_need_summary_guess: "funding_need_summary"
};

const formatMetricValue = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("fi-FI");
  return String(value);
};

const createBufferFromMetrics = (metrics = {}) => {
  const buffer = {};
  EDITABLE_FIELDS.forEach((field) => {
    const value = metrics?.[field];
    buffer[field] =
      value === null || value === undefined ? "" : String(value ?? "");
  });
  return buffer;
};

const normalizeForComparison = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return String(value ?? "");
};

const buildUpdatesPayload = (buffer = {}, metrics = {}) => {
  const updates = {};
  EDITABLE_FIELDS.forEach((field) => {
    const bufferedValue = buffer[field] ?? "";
    const baseline = normalizeForComparison(metrics[field]);
    if (normalizeForComparison(bufferedValue) !== baseline) {
      updates[field] = bufferedValue;
    }
  });
  return updates;
};

const formatChangeTimestamp = (timestamp) => {
  if (!timestamp) return "—";
  try {
    return new Intl.DateTimeFormat("fi-FI", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(timestamp));
  } catch (error) {
    return timestamp;
  }
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return "unknown";
  const created = new Date(timestamp).getTime();
  const diffMs = Date.now() - created;

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return "<1 hour ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
};

function InvestmentReportView({ report }) {
  if (!report) {
    return (
      <div className="advisor-output">
        <p>No investment report data available.</p>
      </div>
    );
  }

  const {
    stage_inferred,
    funding_need_type_inferred,
    funding_instrument_mix = [],
    recommended_investors = [],
    search_summary,
    uncertainty_flags
  } = report;

  return (
    <div className="advisor-output">
      <div className="advisor-summary">
        <div>
          <p className="advisor-label">Stage</p>
          <p>{stage_inferred || "—"}</p>
        </div>
        <div>
          <p className="advisor-label">Funding need</p>
          <p>{funding_need_type_inferred || "—"}</p>
        </div>
      </div>

      {funding_instrument_mix.length > 0 && (
        <div className="advisor-section">
          <h3>Funding instrument mix</h3>
          <div className="instrument-list">
            {funding_instrument_mix.map((instrument, index) => (
              <article key={index} className="instrument-card">
                <div className="instrument-header">
                  <span className="instrument-type">
                    {instrument.instrument_type || "Instrument"}
                  </span>
                  <span className={`priority-pill ${instrument.priority || "medium"}`}>
                    {instrument.priority || "medium"}
                  </span>
                </div>
                <p className="instrument-amounts">
                  {instrument.target_amount_eur_min
                    ? instrument.target_amount_eur_min.toLocaleString("fi-FI")
                    : "—"}{" "}
                  €
                  {" — "}
                  {instrument.target_amount_eur_max
                    ? instrument.target_amount_eur_max.toLocaleString("fi-FI")
                    : "—"}{" "}
                  €
                </p>
                <p className="instrument-rationale">
                  {instrument.rationale || "No rationale provided."}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}

      {recommended_investors.length > 0 && (
        <div className="advisor-section">
          <h3>Recommended investors</h3>
          <div className="investor-list">
            {recommended_investors.map((investor) => (
              <article
                key={`${investor.name}-${investor.website_url}`}
                className="investor-card"
              >
                <div className="investor-header">
                  <div>
                    <p className="investor-name">{investor.name}</p>
                    <p className="investor-type">{investor.type}</p>
                  </div>
                  {investor.website_url && (
                    <a
                      href={investor.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="metric-link"
                    >
                      Website
                    </a>
                  )}
                </div>
                <div className="investor-meta">
                  <span>{investor.geo_focus || "Geo n/a"}</span>
                  <span>{investor.sector_focus || "Sector n/a"}</span>
                  <span>{investor.stage_focus || "Stage n/a"}</span>
                </div>
                <p className="investor-amounts">
                  {investor.ticket_size_min_eur
                    ? investor.ticket_size_min_eur.toLocaleString("fi-FI")
                    : "—"}{" "}
                  € –{" "}
                  {investor.ticket_size_max_eur
                    ? investor.ticket_size_max_eur.toLocaleString("fi-FI")
                    : "—"}{" "}
                  €
                </p>
                <p className="investor-fit">
                  {investor.fit_reason || "No fit reason provided."}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}

      <div className="advisor-section">
        <h3>Search summary</h3>
        <p>{search_summary || "No summary provided."}</p>
      </div>

      {uncertainty_flags && (
        <div className="advisor-section">
          <h3>Uncertainty notes</h3>
          <p>{uncertainty_flags}</p>
        </div>
      )}
    </div>
  );
}

function App() {
  const [companyNameSimple, setCompanyNameSimple] = useState("");
  const [simpleOutput, setSimpleOutput] = useState("");
  const [basicLoading, setBasicLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [history, setHistory] = useState([]);
  const [expandedCaseId, setExpandedCaseId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [advisorError, setAdvisorError] = useState("");
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [editBuffers, setEditBuffers] = useState({});
  const [validationStatus, setValidationStatus] = useState({});
  const [editingEntries, setEditingEntries] = useState({});
  const [openChangePopoverKey, setOpenChangePopoverKey] = useState("");
  const [reportEditBuffers, setReportEditBuffers] = useState({});
  const [reportValidationStatus, setReportValidationStatus] = useState({});
  const [editingReports, setEditingReports] = useState({});
  const [reportChangeModal, setReportChangeModal] = useState(null);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch(
        `http://localhost:4000/api/company/history?limit=${HISTORY_LIMIT}`
      );
      if (!response.ok) {
        console.error("Failed to load history:", response.status);
        return;
      }
      const data = await response.json();
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleSimpleSubmit = async (event) => {
    event.preventDefault();

    setBasicLoading(true);
    setLookupError("");

    try {
      const response = await fetch(
        "http://localhost:4000/api/company/summary-basic",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ companyName: companyNameSimple })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const baseError =
          data?.error || "Company lookup failed. Please try again.";
        const detail = data?.details ? ` (${data.details})` : "";
        setLookupError(`${baseError}${detail}`);
        return;
      }

      console.log("Basic company metrics:", data.metrics);
      setSimpleOutput(data.summary || "");
      setLookupError("");
      fetchHistory();
    } catch (error) {
      console.error("Error calling basic summary endpoint:", error);
      setLookupError("Unexpected error. Check the console for details.");
    } finally {
      setBasicLoading(false);
    }
  };

  const handleEntryToggle = useCallback((entryId, entry) => {
    setExpandedCaseId((prev) => (prev === entryId ? null : entryId));

    if (entry?.entryType === "investment_report") {
      setReportEditBuffers((prev) => {
        if (prev[entry.reportId]) return prev;
        return {
          ...prev,
          [entry.reportId]: formatRecommendationJson(entry.investmentReport)
        };
      });
      return;
    }

    setEditBuffers((prev) => {
      if (prev[entry.companyId]) return prev;
      return {
        ...prev,
        [entry.companyId]: createBufferFromMetrics(entry.metrics)
      };
    });
  }, []);

  const handleEditClick = useCallback((entry) => {
    setEditingEntries((prev) => ({
      ...prev,
      [entry.companyId]: true
    }));
    setValidationStatus((prev) => ({
      ...prev,
      [entry.companyId]: { status: "idle", message: "" }
    }));
    setEditBuffers((prev) => ({
      ...prev,
      [entry.companyId]:
        prev[entry.companyId] || createBufferFromMetrics(entry.metrics)
    }));
  }, []);

  const handleCancelEdit = useCallback((entry) => {
    setEditingEntries((prev) => ({
      ...prev,
      [entry.companyId]: false
    }));
    setEditBuffers((prev) => ({
      ...prev,
      [entry.companyId]: createBufferFromMetrics(entry.metrics || {})
    }));
    setValidationStatus((prev) => ({
      ...prev,
      [entry.companyId]: { status: "idle", message: "" }
    }));
  }, []);

  useEffect(() => {
    if (!openChangePopoverKey) return undefined;

    const handleOutsideClick = (event) => {
      if (
        event.target.closest(".change-popover") ||
        event.target.closest(".change-indicator")
      ) {
        return;
      }
      setOpenChangePopoverKey("");
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [openChangePopoverKey]);

  const handleReportEdit = useCallback((entry) => {
    setEditingReports((prev) => ({
      ...prev,
      [entry.reportId]: true
    }));
    setReportValidationStatus((prev) => ({
      ...prev,
      [entry.reportId]: { status: "idle", message: "" }
    }));
    setReportEditBuffers((prev) => ({
      ...prev,
      [entry.reportId]: prev[entry.reportId] ??
        formatRecommendationJson(entry.investmentReport)
    }));
  }, []);

  const handleReportBufferChange = useCallback((reportId, value) => {
    setReportEditBuffers((prev) => ({
      ...prev,
      [reportId]: value
    }));
  }, []);

  const handleReportCancel = useCallback((entry) => {
    setEditingReports((prev) => ({
      ...prev,
      [entry.reportId]: false
    }));
    setReportEditBuffers((prev) => ({
      ...prev,
      [entry.reportId]: formatRecommendationJson(entry.investmentReport)
    }));
    setReportValidationStatus((prev) => ({
      ...prev,
      [entry.reportId]: { status: "idle", message: "" }
    }));
  }, []);

  const handleReportValidate = useCallback(
    async (entry) => {
      const reportId = entry.reportId;
      const buffer =
        reportEditBuffers[reportId] ||
        formatRecommendationJson(entry.investmentReport);

      let parsedRecommendation;
      try {
        parsedRecommendation = JSON.parse(buffer);
      } catch (error) {
        setReportValidationStatus((prev) => ({
          ...prev,
          [reportId]: {
            status: "error",
            message: error.message || "Invalid JSON payload."
          }
        }));
        return;
      }

      setReportValidationStatus((prev) => ({
        ...prev,
        [reportId]: { status: "loading" }
      }));

      try {
        const response = await fetch(
          "http://localhost:4000/api/investor-report/manual-validate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reportId,
              recommendation: parsedRecommendation
            })
          }
        );

        const data = await response.json();
        if (!response.ok) {
          const message = data?.details || data?.error || "Validation failed.";
          throw new Error(message);
        }

        const nextRecommendation =
          data?.recommendation ?? parsedRecommendation;

        setReportValidationStatus((prev) => ({
          ...prev,
          [reportId]: {
            status: "success",
            message: data?.message || "Changes saved."
          }
        }));

        setReportEditBuffers((prev) => ({
          ...prev,
          [reportId]: formatRecommendationJson(nextRecommendation)
        }));

        setEditingReports((prev) => ({
          ...prev,
          [reportId]: false
        }));

        await fetchHistory();
      } catch (error) {
        setReportValidationStatus((prev) => ({
          ...prev,
          [reportId]: {
            status: "error",
            message: error.message || "Failed to validate changes."
          }
        }));
      }
    },
    [reportEditBuffers, fetchHistory]
  );

  const handleFieldChange = useCallback((companyId, field, value) => {
    setEditBuffers((prev) => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] || {}),
        [field]: value
      }
    }));
  }, []);

  const handleValidateClick = useCallback(
    async (entry, forcedUpdates) => {
      const companyId = entry.companyId;
      const currentBuffer =
        editBuffers[companyId] || createBufferFromMetrics(entry.metrics);
      const currentMetrics = entry.metrics || {};

      const updates = forcedUpdates ?? buildUpdatesPayload(currentBuffer, currentMetrics);

      if (Object.keys(updates).length === 0) {
        setValidationStatus((prev) => ({
          ...prev,
          [companyId]: {
            status: "idle",
            message: "No changes to validate."
          }
        }));
        return;
      }

      setValidationStatus((prev) => ({
        ...prev,
        [companyId]: {
          status: "loading"
        }
      }));

      try {
        const response = await fetch(
          "http://localhost:4000/api/company/manual-validate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyId, updates })
          }
        );

        const data = await response.json();
        if (!response.ok) {
          const message = data?.details || data?.error || "Validation failed.";
          throw new Error(message);
        }

        setValidationStatus((prev) => ({
          ...prev,
          [companyId]: {
            status: "success",
            message: data?.message || "Changes saved."
          }
        }));

        if (data?.metrics) {
          setEditBuffers((prev) => ({
            ...prev,
            [companyId]: createBufferFromMetrics(data.metrics)
          }));
        }

        setEditingEntries((prev) => ({
          ...prev,
          [companyId]: false
        }));

        await fetchHistory();
      } catch (error) {
        setValidationStatus((prev) => ({
          ...prev,
          [companyId]: {
            status: "error",
            message: error.message || "Failed to validate changes."
          }
        }));
      }
    },
    [editBuffers, fetchHistory]
  );

  const historyList = useMemo(() => history || [], [history]);

  const companyOptions = useMemo(() => {
    const map = new Map();
    historyList.forEach((entry) => {
      if (!map.has(entry.companyId)) {
        map.set(entry.companyId, {
          companyId: entry.companyId,
          companyName: entry.companyName
        });
      }
    });
    return Array.from(map.values());
  }, [historyList]);

  const handleInvestorMatch = async (event) => {
    event.preventDefault();
    if (!selectedCompanyId) return;

    setAdvisorLoading(true);
    setAdvisorError("");

    try {
      const response = await fetch(
        "http://localhost:4000/api/company/investor-match",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: Number(selectedCompanyId) })
        }
      );

      if (!response.ok) {
        const message = await response.json().catch(() => ({}));
        const baseError =
          message?.error || "Investor advisor request failed. Try again.";
        const detail = message?.details ? ` (${message.details})` : "";
        setAdvisorError(`${baseError}${detail}`);
        return;
      }

      await response.json();
      await fetchHistory();
    } catch (error) {
      console.error("Error calling investor advisor:", error);
      setAdvisorError("Unexpected error. Check the console for details.");
    } finally {
      setAdvisorLoading(false);
    }
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <h1>Smart Funding Advisor</h1>
          <p className="app-subtitle">
            MVP view for Business Turku funding advisors
          </p>
        </div>
      </header>

      <main className="app-main">
        <section className="panel compose-panel">
          <div className="panel-block">
            <h2>Company lookup</h2>
            <p className="panel-description">
              Enter the name of a Finnish limited company (e.g. &quot;Example
              Oy&quot;). The backend now uses an OpenAI GPT-5.1 reasoning model
              with live web search to populate the company record. Inconsistencies
              in output can be fixed by refining the agent&apos;s instructions.
            </p>

            <form className="form" onSubmit={handleSimpleSubmit}>
              <label className="field">
                <span>Company name (Oy):</span>
                <input
                  type="text"
                  placeholder="e.g. Example Solutions Oy"
                  value={companyNameSimple}
                  onChange={(e) => setCompanyNameSimple(e.target.value)}
                  required
                />
              </label>

              <div className="button-row">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={basicLoading}
                >
                  {basicLoading ? "Generating…" : "Generate basic summary"}
                </button>
                {basicLoading && <span className="button-spinner" aria-hidden />}
              </div>
              {lookupError && <p className="error-text">{lookupError}</p>}
            </form>

            {simpleOutput && (
              <div className="output">
                <h3>Generated summary</h3>
                <pre>{simpleOutput}</pre>
              </div>
            )}
          </div>

          <div className="panel-divider" />

          <div className="panel-block advisor-panel">
            <h2>Investor &amp; funding advisor</h2>
            <p className="panel-description">
              Run a dedicated agent on any previously enriched company to discover
              matching funding instruments and concrete investor candidates. The
              agent performs fresh web searches on every run.
            </p>

            <form className="form advisor-form" onSubmit={handleInvestorMatch}>
              <label className="field">
                <span>Choose company from history</span>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  required
                >
                  <option value="">Select a stored company…</option>
                  {companyOptions.map((company) => (
                    <option key={company.companyId} value={company.companyId}>
                      {company.companyName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="button-row">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    advisorLoading || companyOptions.length === 0
                  }
                >
                  {advisorLoading ? "Running investor agent…" : "Generate matches"}
                </button>
                {advisorLoading && (
                  <span className="button-spinner" aria-hidden />
                )}
              </div>
              {advisorError && <p className="error-text">{advisorError}</p>}
            </form>
          </div>
        </section>

        <section className="panel history-panel">
          <div className="history-panel__header">
            <div>
              <h2>Recent lookups</h2>
              <p className="panel-description">
                Click a company to open its latest metrics snapshot. Entries update
                automatically after every successful search.
              </p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={fetchHistory}
              disabled={historyLoading}
            >
              {historyLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="history-list">
            {historyList.length === 0 && !historyLoading && (
              <div className="history-empty">
                No lookups yet. Search for a company to start the log.
              </div>
            )}

            {historyList.map((entry) => {
              const entryType = entry.entryType || "lookup";
              const isReport = entryType === "investment_report";
              const entryId =
                entryType === "investment_report"
                  ? `report-${entry.reportId}`
                  : `case-${entry.caseId}`;
              const isExpanded = expandedCaseId === entryId;
              const metrics = entry.metrics || {};
              const buffer =
                editBuffers[entry.companyId] || createBufferFromMetrics(metrics);
              const pendingUpdates = buildUpdatesPayload(buffer, metrics);
              const hasPendingChanges = Object.keys(pendingUpdates).length > 0;
              const label = entry.companyName;
              const reportData = entry.investmentReport;
              const isEditing = editingEntries[entry.companyId] || false;
              const manualChangeLog = entry.manualChangeLog || [];
              const isReportEditing = editingReports[entry.reportId] || false;
              const reportBuffer =
                reportEditBuffers[entry.reportId] ||
                formatRecommendationJson(reportData);
              const reportBaseline = formatRecommendationJson(reportData);
              const hasReportChanges =
                reportBuffer.trim() !== reportBaseline.trim();
              const reportStatus = reportValidationStatus[entry.reportId];

              return (
                <article
                  key={entryId}
                  className={`history-entry ${isExpanded ? "expanded" : ""}`}
                >
              <button
                type="button"
                className="history-entry__toggle"
                onClick={() => handleEntryToggle(entryId, entry)}
              >
                    <div>
                      <p className="history-entry__name">
                        {label}
                        {isReport && (
                          <span className="history-entry__subline">
                            {" "}
                            — investment report
                            {manualChangeLog.length > 0 && (
                              <>
                                {" "}
                                <span className="investment-report-separator">
                                  |
                                </span>{" "}
                                <button
                                  type="button"
                                  className="change-indicator"
                                  onClick={() =>
                                    setReportChangeModal({
                                      entryId,
                                      changes: manualChangeLog
                                    })
                                  }
                                >
                                  <span>View changes</span>
                                </button>
                              </>
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="relative-time">
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </button>

                  {isExpanded && (
                    <>
                      {isReport ? (
                        <div className="investment-report-section">
                          {!isReportEditing ? (
                            <>
                              <InvestmentReportView report={reportData} />
                              <div className="history-entry__actions">
                                <button
                                  type="button"
                                  className="validate-button"
                                  onClick={() => handleReportEdit(entry)}
                                >
                                  Edit output
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="investor-edit">
                              <label className="field">
                                <span>Recommendation JSON</span>
                                <textarea
                                  className="metric-input textarea"
                                  value={reportBuffer}
                                  onChange={(event) =>
                                    handleReportBufferChange(
                                      entry.reportId,
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <div className="history-entry__actions">
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => handleReportCancel(entry)}
                                >
                                  Cancel edits
                                </button>
                                <button
                                  type="button"
                                  className="validate-button"
                                  onClick={() => handleReportValidate(entry)}
                                  disabled={
                                    reportStatus?.status === "loading" ||
                                    !hasReportChanges
                                  }
                                >
                                  {reportStatus?.status === "loading"
                                    ? "Validating…"
                                    : "Validate & save"}
                                </button>
                                {reportStatus?.message && (
                                  <span
                                    className={`validation-message ${reportStatus?.status || "idle"}`}
                                  >
                                    {reportStatus.message}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="history-metrics">
                          {METRIC_SECTIONS.map((section) => (
                            <div key={section.title} className="metric-section">
                              <p className="metric-section__title">
                                {section.title}
                              </p>
                              <div className="metric-grid">
                                {section.fields.map((field) => {
                                  if (!isEditing) {
                                    const columnName = FIELD_COLUMN_MAP[field];
                                    const fieldChanges = columnName
                                      ? manualChangeLog.filter(
                                          (change) => change.column === columnName
                                        )
                                      : [];
                                    const hasFieldChanges =
                                      fieldChanges.length > 0;
                                    const popoverKey = `${entry.companyId}-${field}`;
                                    const popoverOpen =
                                      openChangePopoverKey === popoverKey;

                                    return (
                                      <div key={field} className="metric-pair">
                                        <span className="metric-label">
                                          {METRIC_LABELS[field]}
                                        </span>
                                        {field === "website_url" &&
                                        metrics[field] &&
                                        typeof metrics[field] === "string" ? (
                                          <a
                                            className="metric-value metric-link"
                                            href={metrics[field]}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            {metrics[field]}
                                          </a>
                                        ) : (
                                          <span className="metric-value">
                                            {formatMetricValue(metrics[field])}
                                          </span>
                                        )}
                                        {DENSE_FIELDS.has(field) && metrics[field] && (
                                          <div className="double-divider" />
                                        )}
                                        {hasFieldChanges && (
                                          <div className="change-indicator-wrapper">
                                            <button
                                              type="button"
                                              className="change-indicator"
                                              onClick={() =>
                                                setOpenChangePopoverKey(
                                                  popoverOpen ? "" : popoverKey
                                                )
                                              }
                                            >
                                              <span>View changes</span>
                                            </button>
                                            {popoverOpen && (
                                              <div className="change-popover">
                                                <p className="change-popover__title">
                                                  Change history
                                                </p>
                                                <div className="change-popover__table-wrapper">
                                                  <table className="change-popover__table">
                                                    <thead>
                                                      <tr>
                                                        <th>Changed</th>
                                                        <th>From</th>
                                                        <th>To</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {fieldChanges
                                                        .slice()
                                                        .sort(
                                                          (a, b) =>
                                                            new Date(b.changedAt) -
                                                            new Date(a.changedAt)
                                                        )
                                                        .map((change, index) => (
                                                          <tr key={`${popoverKey}-${index}`}>
                                                            <td>
                                                              {formatChangeTimestamp(
                                                                change.changedAt
                                                              )}
                                                            </td>
                                                            <td>
                                                              {formatMetricValue(change.from)}
                                                            </td>
                                                            <td>
                                                              {formatMetricValue(change.to)}
                                                            </td>
                                                          </tr>
                                                        ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }

                                  const buffer =
                                    editBuffers[entry.companyId] ||
                                    createBufferFromMetrics(metrics);
                                  const value =
                                    buffer[field] ??
                                    (metrics[field] === null ||
                                    metrics[field] === undefined
                                      ? ""
                                      : String(metrics[field]));
                                  const inputValue =
                                    value === null || value === undefined
                                      ? ""
                                      : value;
                                  const isDense = DENSE_FIELDS.has(field);
                                  const inputProps = {
                                    value: inputValue,
                                    onChange: (event) =>
                                      handleFieldChange(
                                        entry.companyId,
                                        field,
                                        event.target.value
                                      )
                                  };

                                  return (
                                    <label key={field} className="metric-pair editable">
                                      <span className="metric-label">
                                        {METRIC_LABELS[field]}
                                      </span>
                                      {isDense ? (
                                        <textarea
                                          className="metric-input textarea"
                                          {...inputProps}
                                        />
                                      ) : (
                                        <input
                                          className="metric-input"
                                          type={
                                            NUMERIC_FIELDS.has(field)
                                              ? "number"
                                              : "text"
                                          }
                                          {...inputProps}
                                        />
                                      )}
                                      {DENSE_FIELDS.has(field) && metrics[field] && (
                                        <div className="double-divider" />
                                      )}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          <div className="history-entry__actions">
                            {!isEditing ? (
                              <button
                                type="button"
                                className="validate-button"
                                onClick={() => handleEditClick(entry)}
                              >
                                Edit output
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => handleCancelEdit(entry)}
                                >
                                  Cancel edits
                                </button>
                                <button
                                  type="button"
                                  className="validate-button"
                                  onClick={() =>
                                    handleValidateClick(entry, pendingUpdates)
                                  }
                                  disabled={
                                    validationStatus[entry.companyId]?.status ===
                                      "loading" || !hasPendingChanges
                                  }
                                >
                                  {validationStatus[entry.companyId]?.status ===
                                  "loading"
                                    ? "Validating…"
                                    : "Validate & save"}
                                </button>
                                {validationStatus[entry.companyId]?.message && (
                                  <span
                                    className={`validation-message ${validationStatus[entry.companyId]?.status || "idle"}`}
                                  >
                                    {validationStatus[entry.companyId]?.message}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {reportChangeModal && (
        <div
          className="change-modal-overlay"
          onClick={() => setReportChangeModal(null)}
        >
          <div
            className="change-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="change-modal__header">
              <h3>Investor report change history</h3>
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setReportChangeModal(null)}
              >
                Close
              </button>
            </div>
            <div className="change-popover__table-wrapper">
              <table className="change-popover__table">
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Changed</th>
                  </tr>
                </thead>
                <tbody>
                  {reportChangeModal.changes.map((change, index) => (
                    <tr key={`modal-change-${index}`}>
                      <td>{change.jsonPath}</td>
                      <td>{formatMetricValue(change.fromValue)}</td>
                      <td>{formatMetricValue(change.toValue)}</td>
                      <td>{formatChangeTimestamp(change.changedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <span>
          MVP demo &ndash; LLM-backed enrichment calls are active (see browser
          console for details).
        </span>
      </footer>
    </div>
  );
}

export default App;


