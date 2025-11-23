import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const lookupAgentPrompt = process.env.LOOKUP_AGENT;
const fundingAdvisorPrompt = process.env.FUNDING_ADVISOR_AGENT;

if (!apiKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[openai] OPENAI_API_KEY is not set. LLM calls will fail until this is configured."
  );
}

if (!lookupAgentPrompt) {
  // eslint-disable-next-line no-console
  console.warn(
    "[openai] LOOKUP_AGENT is not set. Company enrichment prompts will fail."
  );
}

if (!fundingAdvisorPrompt) {
  // eslint-disable-next-line no-console
  console.warn(
    "[openai] FUNDING_ADVISOR_AGENT is not set. Funding recommendation prompts will fail."
  );
}

export const openaiClient = new OpenAI({
  apiKey
});

export const COMPANY_REASONING_MODEL =
  process.env.OPENAI_REASONING_MODEL || "gpt-5.1";

export const COMPANY_REASONING_EFFORT =
  process.env.OPENAI_REASONING_EFFORT || "medium";

export const COMPANY_WEB_SEARCH_ENABLED =
  process.env.OPENAI_ENABLE_WEB_SEARCH !== "false";

export const LOOKUP_AGENT = lookupAgentPrompt;
export const FUNDING_ADVISOR_AGENT = fundingAdvisorPrompt;


