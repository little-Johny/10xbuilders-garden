import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearTestEnv, setupTestEnv } from './helpers/env.js';
import { EnvValidationError, getEnv, skipDotenvForTests } from '../src/config/env.js';

beforeEach(() => setupTestEnv());
afterEach(() => clearTestEnv());

describe('getEnv', () => {
  it('returns the parsed env with defaults applied', () => {
    const env = getEnv();
    expect(env.OPENROUTER_MODEL).toBe('openai/gpt-4o-mini');
    expect(env.SHEET_NAME).toBe('progress_tracker');
    expect(env.SPREADSHEET_ID).toBe('test-spreadsheet');
  });

  it('throws EnvValidationError with missing keys when required vars are absent', () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.SPREADSHEET_ID;
    skipDotenvForTests();
    try {
      getEnv();
      throw new Error('expected EnvValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const typed = /** @type {EnvValidationError} */ (err);
      expect(typed.missingKeys).toEqual(
        expect.arrayContaining(['OPENROUTER_API_KEY', 'SPREADSHEET_ID']),
      );
      expect(typed.userMessage).toMatch(/\.env\.local/i);
      expect(typed.userMessage).not.toMatch(/stack|\.js:/i);
    }
  });
});
