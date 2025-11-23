import {
  openaiClient,
  COMPANY_REASONING_MODEL,
  COMPANY_REASONING_EFFORT,
  COMPANY_WEB_SEARCH_ENABLED,
  LOOKUP_AGENT
} from "./openaiClient.js";

const LOOKUP_AGENT_MISSING_MESSAGE =
  "LOOKUP_AGENT prompt is missing. Add it to backend/.env to enable company lookups.";

function buildEnrichmentPrompt(companyName) {
  if (!LOOKUP_AGENT) {
    const error = new Error(LOOKUP_AGENT_MISSING_MESSAGE);
    error.code = "MISSING_LOOKUP_AGENT";
    throw error;
  }

  return [
    {
      role: "system",
      content: LOOKUP_AGENT
    },
    {
      role: "user",
      content:
        `Investigate "${companyName}" using web search. ` +
        "Populate the JSON row for the `companies` table (columns listed in the system prompt). " +
        "Run as many searches as necessary to ensure the values are up to date."
    }
  ];
}

function extractJsonPayload(response) {
  const tryParse = (text) => {
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      const firstBrace = trimmed.indexOf("{");
      const lastBrace = trimmed.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1) {
        throw error;
      }

      const jsonSlice = trimmed.slice(firstBrace, lastBrace + 1);
      return JSON.parse(jsonSlice);
    }
  };

  if (Array.isArray(response.output_text) && response.output_text.length > 0) {
    const parsed = tryParse(response.output_text.join("\n"));
    if (parsed) return parsed;
  }

  if (response.output && Array.isArray(response.output)) {
    for (const block of response.output) {
      if (!block?.content) continue;
      const textChunks = block.content
        .map((item) => {
          if (item.type === "output_text" && typeof item.text === "string") {
            return item.text;
          }
          if (item.type === "text" && typeof item.text === "string") {
            return item.text;
          }
          return "";
        })
        .filter(Boolean);

      const parsed = tryParse(textChunks.join(""));
      if (parsed) return parsed;
    }
  }

  throw new Error("Empty response from OpenAI reasoning model");
}

export async function inferCompanyBaseMetrics(companyName) {
  const messages = buildEnrichmentPrompt(companyName);

  try {
    const response = await openaiClient.responses.create({
      model: COMPANY_REASONING_MODEL,
      reasoning: {
        effort: COMPANY_REASONING_EFFORT
      },
      input: messages,
      tools: COMPANY_WEB_SEARCH_ENABLED ? [{ type: "web_search" }] : []
    });

    const parsed = extractJsonPayload(response);
    const raw = JSON.stringify(parsed);

    return {
      metrics: parsed,
      raw
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[openai] Failed to infer company metrics:", error);

    const fallbackSummary = `Basic information for company ${companyName}: an AI enrichment call failed, so only minimal data is available.`;

    return {
      metrics: {
        name: companyName,
        business_id: null,
        website_url: null,
        country: "Finland",
        city: null,
        industry_text: null,
        industry_code: null,
        employee_count: null,
        employee_range: null,
        revenue_eur: null,
        revenue_range: null,
        stage: null,
        funding_need_type_guess: null,
        funding_need_min_eur_guess: null,
        funding_need_max_eur_guess: null,
        funding_need_summary_guess: null,
        description: null,
        summary: fallbackSummary
      },
      raw: null
    };
  }
}
