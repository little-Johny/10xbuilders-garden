import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Custom error type for environment validation failures.
 * Carries an actionable message in Spanish for end users without
 * leaking variable values or technical traces (guardrails §2.1, §2.3, §7.3).
 */
export class EnvValidationError extends Error {
  /**
   * @param {string} userMessage Spanish, user-facing message.
   * @param {string[]} [missingKeys] Names of the missing or invalid env vars.
   */
  constructor(userMessage, missingKeys = []) {
    super(userMessage);
    this.name = 'EnvValidationError';
    this.userMessage = userMessage;
    this.missingKeys = missingKeys;
  }
}

const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_MODEL: z.string().min(1).default('openai/gpt-4o-mini'),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_TEMPERATURE: z.coerce.number().default(0),
  OPENROUTER_HTTP_REFERER: z.string().url().optional(),
  OPENROUTER_APP_TITLE: z.string().min(1).optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z
    .string()
    .min(1, 'GOOGLE_APPLICATION_CREDENTIALS is required'),
  SPREADSHEET_ID: z.string().min(1, 'SPREADSHEET_ID is required'),
  SHEET_NAME: z.string().min(1).default('progress_tracker'),
  TEST_SPREADSHEET_ID: z.string().min(1).optional(),
  AISAAC_DEBUG: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false'), z.literal('')])
    .optional(),
});

/**
 * @typedef {z.infer<typeof envSchema>} AppEnv
 */

/** @type {AppEnv | null} */
let cachedEnv = null;
let dotenvLoaded = false;

/**
 * Loads `.env.local` (preferred) or `.env` exactly once into `process.env`.
 * Keeps behavior idempotent across tests.
 */
function loadDotenvOnce() {
  if (dotenvLoaded) return;
  const candidates = ['.env.local', '.env'];
  for (const file of candidates) {
    const fullPath = resolve(process.cwd(), file);
    if (existsSync(fullPath)) {
      dotenv.config({ path: fullPath });
      break;
    }
  }
  dotenvLoaded = true;
}

/**
 * Parses and validates the runtime environment.
 * Caches the result so callers can invoke it freely.
 *
 * @returns {AppEnv}
 * @throws {EnvValidationError} when required variables are missing or malformed.
 */
export function getEnv() {
  if (cachedEnv) return cachedEnv;
  loadDotenvOnce();

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues;
    const missingKeys = issues
      .map((issue) => String(issue.path[0] ?? ''))
      .filter((key) => key.length > 0);
    const uniqueKeys = Array.from(new Set(missingKeys));
    const list = uniqueKeys.join(', ');
    const userMessage = uniqueKeys.length
      ? `Configuración incompleta o inválida. Revisa estas variables en tu .env.local: ${list}.`
      : 'Configuración inválida. Revisa tu .env.local.';
    throw new EnvValidationError(userMessage, uniqueKeys);
  }

  cachedEnv = Object.freeze(result.data);
  return cachedEnv;
}

/**
 * Test-only helper to reset the cached environment.
 */
export function resetEnvCacheForTests() {
  cachedEnv = null;
  dotenvLoaded = false;
}

/**
 * Test-only helper: marks dotenv as already loaded so that subsequent
 * calls to `getEnv` read exclusively from `process.env` without
 * re-reading any on-disk `.env` file.
 */
export function skipDotenvForTests() {
  cachedEnv = null;
  dotenvLoaded = true;
}
