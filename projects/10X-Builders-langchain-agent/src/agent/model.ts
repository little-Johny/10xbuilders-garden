import { ChatOpenAI } from '@langchain/openai';
import { getEnv } from '../config/env.js';

export function createModel(): ChatOpenAI {
  const env = getEnv();
  const defaultHeaders: Record<string, string> = {};

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
    configuration: {
      baseURL: env.OPENROUTER_BASE_URL,
      ...(Object.keys(defaultHeaders).length > 0 ? { defaultHeaders } : {}),
    },
  });
}
