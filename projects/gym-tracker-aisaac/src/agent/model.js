import { ChatOpenAI } from '@langchain/openai';
import { getEnv } from '../config/env.js';

/**
 * Builds the chat model used by the agent. Targets OpenRouter via its
 * OpenAI-compatible API surface and forwards the optional provider
 * headers (`HTTP-Referer`, `X-Title`).
 *
 * @returns {ChatOpenAI}
 */
export function createModel() {
  const env = getEnv();
  /** @type {Record<string, string>} */
  const defaultHeaders = {};
  if (env.OPENROUTER_HTTP_REFERER) {
    defaultHeaders['HTTP-Referer'] = env.OPENROUTER_HTTP_REFERER;
  }
  if (env.OPENROUTER_APP_TITLE) {
    defaultHeaders['X-Title'] = env.OPENROUTER_APP_TITLE;
  }
  return new ChatOpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL,
    temperature: env.OPENROUTER_TEMPERATURE,
    // Streaming off: OpenRouter's stream chunks duplicate metadata and
    // occasionally the tool call itself, which produced duplicated rows
    // in the sheet and the "delay" effect in the REPL.
    streaming: false,
    configuration: {
      baseURL: env.OPENROUTER_BASE_URL,
      ...(Object.keys(defaultHeaders).length > 0 ? { defaultHeaders } : {}),
    },
  });
}
