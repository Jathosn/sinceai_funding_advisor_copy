import {
  openaiClient,
  COMPANY_REASONING_MODEL,
  COMPANY_REASONING_EFFORT,
  COMPANY_WEB_SEARCH_ENABLED,
  FUNDING_ADVISOR_AGENT
} from "./openaiClient.js";

const FUNDING_AGENT_MISSING_MESSAGE =
  "FUNDING_ADVISOR_AGENT prompt is missing. Add it to backend/.env to enable investor searches.";

const EMPTY_RECOMMENDATION = {
  company_name: null,
  country: null,
  stage_inferred: null,
  funding_need_type_inferred: null,
  funding_instrument_mix: [],
  recommended_investors: [],
  search_summary: "",
  uncertainty_flags: ""
};

const INVESTOR_RECOMMENDATION_JSON_SCHEMA = {
  name: "InvestorRecommendation",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "company_name",
      "country",
      "stage_inferred",
      "funding_need_type_inferred",
      "funding_instrument_mix",
      "recommended_investors",
      "search_summary",
      "uncertainty_flags"
    ],
    properties: {
      company_name: { type: ["string", "null"] },
      country: { type: ["string", "null"] },
      stage_inferred: { type: ["string", "null"] },
      funding_need_type_inferred: { type: ["string", "null"] },
      funding_instrument_mix: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "instrument_type",
            "priority",
            "target_amount_eur_min",
            "target_amount_eur_max",
            "rationale"
          ],
          properties: {
            instrument_type: { type: "string" },
            priority: {
              type: "string",
              enum: ["high", "medium", "low"]
            },
            target_amount_eur_min: { type: ["number", "null"] },
            target_amount_eur_max: { type: ["number", "null"] },
            rationale: { type: "string" }
          }
        }
      },
      recommended_investors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "type",
            "geo_focus",
            "sector_focus",
            "stage_focus",
            "ticket_size_min_eur",
            "ticket_size_max_eur",
            "website_url",
            "fit_reason"
          ],
          properties: {
            name: { type: "string" },
            type: { type: "string" },
            geo_focus: { type: ["string", "null"] },
            sector_focus: { type: ["string", "null"] },
            stage_focus: { type: ["string", "null"] },
            ticket_size_min_eur: { type: ["number", "null"] },
            ticket_size_max_eur: { type: ["number", "null"] },
            website_url: { type: ["string", "null"] },
            fit_reason: { type: "string" }
          }
        }
      },
      search_summary: { type: "string" },
      uncertainty_flags: { type: "string" }
    }
  }
};

function buildInvestorPrompt(companyProfile) {
  if (!FUNDING_ADVISOR_AGENT) {
    const error = new Error(FUNDING_AGENT_MISSING_MESSAGE);
    error.code = "MISSING_FUNDING_ADVISOR_AGENT";
    throw error;
  }

  return [
    { role: "system", content: FUNDING_ADVISOR_AGENT },
    {
      role: "user",
      content: `Company JSON:\n${JSON.stringify(companyProfile)}\n` +
        "Return an investor recommendation JSON matching the schema in the system prompt."
    }
  ];
}

function extractJsonPayload(response) {
  const chunks = [];

  if (Array.isArray(response.output_text)) {
    chunks.push(...response.output_text);
  }

  if (Array.isArray(response.output)) {
    for (const block of response.output) {
      if (!block?.content) continue;
      for (const item of block.content) {
        if (
          (item.type === "output_text" || item.type === "text") &&
          typeof item.text === "string"
        ) {
          chunks.push(item.text);
        }
      }
    }
  }

  const combined = chunks.join("\n").trim();
  if (!combined) {
    throw new Error("Empty response from OpenAI investor advisor");
  }

  const tryParse = (text) => {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1) {
        throw error;
      }
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
  };

  return tryParse(combined);
}

function coerceRecommendationShape(payload) {
  if (!payload || typeof payload !== "object") return EMPTY_RECOMMENDATION;

  return {
    company_name: payload.company_name ?? null,
    country: payload.country ?? null,
    stage_inferred: payload.stage_inferred ?? null,
    funding_need_type_inferred: payload.funding_need_type_inferred ?? null,
    funding_instrument_mix: Array.isArray(payload.funding_instrument_mix)
      ? payload.funding_instrument_mix
      : [],
    recommended_investors: Array.isArray(payload.recommended_investors)
      ? payload.recommended_investors
      : [],
    search_summary: payload.search_summary ?? "",
    uncertainty_flags: payload.uncertainty_flags ?? ""
  };
}

export async function recommendInvestorsForCompany(companyProfile) {
  if (!companyProfile || typeof companyProfile !== "object") {
    throw new Error("Company profile is required");
  }

  const messages = buildInvestorPrompt(companyProfile);

  try {
    const response = await openaiClient.responses.create({
      model: COMPANY_REASONING_MODEL,
      reasoning: {
        effort: COMPANY_REASONING_EFFORT
      },
      text: {
        format: {
          type: "json_schema",
          name: INVESTOR_RECOMMENDATION_JSON_SCHEMA.name,
          schema: INVESTOR_RECOMMENDATION_JSON_SCHEMA.schema
        }
      },
      input: messages,
      tools: COMPANY_WEB_SEARCH_ENABLED ? [{ type: "web_search" }] : []
    });

    const parsed = extractJsonPayload(response);
    return coerceRecommendationShape(parsed);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[openai] Investor advisor failed:", error);
    throw error;
  }
}

