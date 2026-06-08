import { ChatOpenAI } from "@langchain/openai";

export function createChatModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  const modelName = process.env.OPENROUTER_MODEL;
  if (!modelName) throw new Error("Missing OPENROUTER_MODEL");

  return new ChatOpenAI({
    modelName,
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

export function createCompactionModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  const modelName = process.env.OPENROUTER_COMPACTION_MODEL;
  if (!modelName) throw new Error("Missing OPENROUTER_COMPACTION_MODEL");

  return new ChatOpenAI({
    modelName,
    temperature: 0.1,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://agents.local",
      },
    },
    apiKey,
  });
}

/**
 * Modelo para la extracción de memoria a largo plazo (memory_flush). Temperatura
 * baja: queremos extracción determinista de hechos, no creatividad.
 * `OPENROUTER_MEMORY_MODEL` cae al modelo de compactación si no está definido,
 * para no romper entornos que aún no lo configuran.
 */
export function createMemoryModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  const modelName =
    process.env.OPENROUTER_MEMORY_MODEL || process.env.OPENROUTER_COMPACTION_MODEL;
  if (!modelName) {
    throw new Error(
      "Missing OPENROUTER_MEMORY_MODEL (or OPENROUTER_COMPACTION_MODEL fallback)",
    );
  }

  return new ChatOpenAI({
    modelName,
    temperature: 0.1,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://agents.local",
      },
    },
    apiKey,
  });
}
