import { describe, expect, it } from 'vitest';
import {
  SheetsFatalError,
  SheetsRecoverableError,
  classifySheetsError,
  getUserMessage,
  withSheetsErrorHandling,
  __testing,
} from '../src/sheets/errors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('classifySheetsError', () => {
  it('maps 404 to spreadsheet-not-found (fatal)', () => {
    const err = classifySheetsError({ code: 404, message: 'not found' });
    expect(err).toBeInstanceOf(SheetsFatalError);
    expect(err.code).toBe('spreadsheet-not-found');
  });

  it('maps 403 to permission-denied (fatal)', () => {
    const err = classifySheetsError({ code: 403, message: 'forbidden' });
    expect(err).toBeInstanceOf(SheetsFatalError);
    expect(err.code).toBe('permission-denied');
  });

  it('maps 400 + "unable to parse range" to sheet-not-found (fatal)', () => {
    const err = classifySheetsError({
      code: 400,
      message: 'Unable to parse range: progress_tracker!A1',
    });
    expect(err).toBeInstanceOf(SheetsFatalError);
    expect(err.code).toBe('sheet-not-found');
  });

  it('maps 429 to rate-limit (recoverable)', () => {
    const err = classifySheetsError({ code: 429 });
    expect(err).toBeInstanceOf(SheetsRecoverableError);
    expect(err.code).toBe('rate-limit');
  });

  it('maps timeouts to timeout (recoverable)', () => {
    const err = classifySheetsError({ code: 'ETIMEDOUT', message: 'request timeout' });
    expect(err).toBeInstanceOf(SheetsRecoverableError);
    expect(err.code).toBe('timeout');
  });
});

describe('getUserMessage', () => {
  it('never includes stack traces, URLs, or raw payloads', () => {
    const fatal = new SheetsFatalError('permission-denied');
    const recoverable = new SheetsRecoverableError('rate-limit');
    for (const err of [fatal, recoverable]) {
      const message = getUserMessage(err);
      expect(message).not.toMatch(/https?:\/\//);
      expect(message).not.toMatch(/\bat\b.*\.js/);
      expect(message).not.toMatch(/\{.*\}/);
    }
  });

  it('falls back to a Spanish generic message for unknown errors', () => {
    const message = getUserMessage(new Error('boom'));
    expect(message).toMatch(/intent[ée]moslo|problema/i);
  });
});

describe('withSheetsErrorHandling', () => {
  it('retries 429 with the configured backoff and rethrows recoverable', async () => {
    let calls = 0;
    const start = Date.now();
    await expect(
      withSheetsErrorHandling('test', async () => {
        calls += 1;
        const err = new Error('rate');
        /** @type {any} */ (err).code = 429;
        throw err;
      }),
    ).rejects.toBeInstanceOf(SheetsRecoverableError);
    const elapsed = Date.now() - start;
    expect(calls).toBe(__testing.RATE_LIMIT_BACKOFF_MS.length + 1);
    expect(elapsed).toBeGreaterThanOrEqual(
      __testing.RATE_LIMIT_BACKOFF_MS.reduce((a, b) => a + b, 0) - 200,
    );
  }, 20_000);

  it('returns immediately on success after retry', async () => {
    let calls = 0;
    const result = await withSheetsErrorHandling('test', async () => {
      calls += 1;
      if (calls === 1) {
        const err = new Error('timeout');
        /** @type {any} */ (err).code = 'ETIMEDOUT';
        throw err;
      }
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('rethrows fatal errors without retry', async () => {
    let calls = 0;
    await expect(
      withSheetsErrorHandling('test', async () => {
        calls += 1;
        const err = new Error('forbidden');
        /** @type {any} */ (err).code = 403;
        throw err;
      }),
    ).rejects.toBeInstanceOf(SheetsFatalError);
    expect(calls).toBe(1);
  });
});

describe('integration sleep helper unused', () => {
  it('sleep utility ok', async () => {
    const start = Date.now();
    await sleep(5);
    expect(Date.now() - start).toBeGreaterThanOrEqual(0);
  });
});
