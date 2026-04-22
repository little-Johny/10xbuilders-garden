import { resetEnvCacheForTests, skipDotenvForTests } from '../../src/config/env.js';

/**
 * Sets a deterministic env for tests and clears caches between runs.
 * Call inside `beforeEach`. Skips any on-disk `.env*` loading so tests
 * remain hermetic.
 */
export function setupTestEnv(overrides = {}) {
  skipDotenvForTests();
  const base = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL: 'openai/gpt-4o-mini',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENROUTER_TEMPERATURE: '0',
    GOOGLE_APPLICATION_CREDENTIALS: './credentials/test.json',
    SPREADSHEET_ID: 'test-spreadsheet',
    SHEET_NAME: 'progress_tracker',
  };
  const final = { ...base, ...overrides };
  for (const [key, value] of Object.entries(final)) {
    process.env[key] = String(value);
  }
}

export function clearTestEnv() {
  const keys = [
    'OPENROUTER_API_KEY',
    'OPENROUTER_MODEL',
    'OPENROUTER_BASE_URL',
    'OPENROUTER_TEMPERATURE',
    'OPENROUTER_HTTP_REFERER',
    'OPENROUTER_APP_TITLE',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'SPREADSHEET_ID',
    'SHEET_NAME',
    'TEST_SPREADSHEET_ID',
  ];
  for (const key of keys) {
    delete process.env[key];
  }
  resetEnvCacheForTests();
}
