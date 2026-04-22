import { ChatOpenAI } from "@langchain/openai";

export function createChatModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  return new ChatOpenAI({
    modelName: "openai/gpt-4o-mini",
    temperature: 0.3,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://agents.local",
      },
    },
    apiKey,
  });
}
