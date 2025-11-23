**Note: Agent prompts are not versioned in this project copy. To run the AI logic three criteria must be met:**

1. Generate an API key at your OpenAI Platform account and store it to the backend folder as a .env file
2. Generate a system message for the LOOKUP_AGENT to run the company lookup and store it to the backend folder as a .env file
3. Generate a system message for the FUNDING_ADVISOR_AGENT to run the investment advisor and store it to the backend folder as a .env file

The .env file should be structured like this:

OPENAI_API_KEY=

LOOKUP_AGENT=`AI agent behavioral logic goes here`

FUNDING_ADVISOR_AGENT=`AI agent behavioral logic goes here`
