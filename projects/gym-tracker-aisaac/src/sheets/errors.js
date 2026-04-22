/**
 * Error wrapping and classification for Google Sheets operations.
 * Maps low-level `googleapis` failures to either a fatal error (closes
 * the session) or a recoverable one (REPL keeps running) without leaking
 * stack traces, URLs, or raw payloads to the user (guardrails §7).
 */

const SHEETS_REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_BACKOFF_MS = [2_000, 4_000];

/**
 * @typedef {'spreadsheet-not-found' | 'permission-denied' | 'sheet-not-found' | 'env-invalid'} FatalCode
 * @typedef {'rate-limit' | 'timeout' | 'unknown'} RecoverableCode
 */

const FATAL_USER_MESSAGES = Object.freeze(
  /** @type {Readonly<Record<FatalCode, string>>} */ ({
    'spreadsheet-not-found':
      'No puedo acceder al sheet configurado. Verifica SPREADSHEET_ID y que el archivo esté compartido con el service account.',
    'permission-denied':
      'El service account no tiene permisos de edición sobre el sheet. Compártelo como Editor y reinicia.',
    'sheet-not-found':
      'La pestaña configurada no existe en el archivo. Créala manualmente y reinicia.',
    'env-invalid':
      'Configuración inválida. Revisa tu .env.local antes de reiniciar.',
  }),
);

const RECOVERABLE_USER_MESSAGES = Object.freeze(
  /** @type {Readonly<Record<RecoverableCode, string>>} */ ({
    'rate-limit':
      'Google Sheets está respondiendo lento por demasiadas peticiones. Intentémoslo de nuevo en unos segundos.',
    timeout:
      'Tardamos demasiado en hablar con Google Sheets. Intentémoslo de nuevo.',
    unknown:
      'Hubo un problema temporal al hablar con Google Sheets. Intentémoslo de nuevo.',
  }),
);

export class SheetsFatalError extends Error {
  /**
   * @param {FatalCode} code
   * @param {string} [overrideMessage]
   */
  constructor(code, overrideMessage) {
    const userMessage = overrideMessage ?? FATAL_USER_MESSAGES[code];
    super(userMessage);
    this.name = 'SheetsFatalError';
    this.code = code;
    this.userMessage = userMessage;
    this.fatal = true;
  }
}

export class SheetsRecoverableError extends Error {
  /**
   * @param {RecoverableCode} code
   * @param {string} [overrideMessage]
   */
  constructor(code, overrideMessage) {
    const userMessage = overrideMessage ?? RECOVERABLE_USER_MESSAGES[code];
    super(userMessage);
    this.name = 'SheetsRecoverableError';
    this.code = code;
    this.userMessage = userMessage;
    this.fatal = false;
  }
}

/**
 * @param {unknown} error
 * @returns {number | null}
 */
function getStatusCode(error) {
  if (!error || typeof error !== 'object') return null;
  const candidate = /** @type {Record<string, unknown>} */ (error);
  if (typeof candidate.code === 'number') return candidate.code;
  if (typeof candidate.status === 'number') return candidate.status;
  const response = /** @type {Record<string, unknown> | undefined} */ (candidate.response);
  if (response && typeof response.status === 'number') {
    return response.status;
  }
  return null;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessageString(error) {
  if (!error || typeof error !== 'object') return String(error ?? '');
  const message = /** @type {Record<string, unknown>} */ (error).message;
  return typeof message === 'string' ? message : '';
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isTimeoutError(error) {
  if (!error || typeof error !== 'object') return false;
  const candidate = /** @type {Record<string, unknown>} */ (error);
  if (candidate.code === 'ETIMEDOUT' || candidate.code === 'ESOCKETTIMEDOUT') return true;
  if (candidate.name === 'AbortError') return true;
  return /timeout/i.test(getErrorMessageString(error));
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Runs a Google Sheets operation under a 10s timeout to allow recovery.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTimeout(fn) {
  let timeoutId = null;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const err = new Error('Sheets request timed out');
          /** @type {Error & { code?: string }} */ (err).code = 'ETIMEDOUT';
          reject(err);
        }, SHEETS_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Maps a raw `googleapis` error into our typed error hierarchy without
 * leaking technical detail. Returns the typed error rather than throwing.
 *
 * @param {unknown} error
 * @returns {SheetsFatalError | SheetsRecoverableError}
 */
export function classifySheetsError(error) {
  const status = getStatusCode(error);
  const message = getErrorMessageString(error);

  if (status === 404) return new SheetsFatalError('spreadsheet-not-found');
  if (status === 403) return new SheetsFatalError('permission-denied');
  if (status === 400 && /unable to parse range/i.test(message)) {
    return new SheetsFatalError('sheet-not-found');
  }
  if (status === 429) return new SheetsRecoverableError('rate-limit');
  if (isTimeoutError(error)) return new SheetsRecoverableError('timeout');
  return new SheetsRecoverableError('unknown');
}

/**
 * Wraps a Sheets call with classification, retries on 429, and a single
 * retry on timeouts. Rethrows a typed error on failure.
 *
 * @template T
 * @param {string} _label Operation label for internal logging.
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withSheetsErrorHandling(_label, fn) {
  let lastError;
  for (let attempt = 0; attempt <= RATE_LIMIT_BACKOFF_MS.length; attempt += 1) {
    try {
      return await withTimeout(fn);
    } catch (error) {
      lastError = error;
      const status = getStatusCode(error);
      if (status === 429 && attempt < RATE_LIMIT_BACKOFF_MS.length) {
        await delay(RATE_LIMIT_BACKOFF_MS[attempt]);
        continue;
      }
      if (isTimeoutError(error) && attempt === 0) {
        continue;
      }
      throw classifySheetsError(error);
    }
  }
  throw classifySheetsError(lastError);
}

/**
 * Returns the user-facing message for any error, falling back to a
 * generic Spanish message when the input is unknown.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function getUserMessage(error) {
  if (error instanceof SheetsFatalError || error instanceof SheetsRecoverableError) {
    return error.userMessage;
  }
  if (error && typeof error === 'object') {
    const candidate = /** @type {Record<string, unknown>} */ (error);
    if (typeof candidate.userMessage === 'string') {
      return /** @type {string} */ (candidate.userMessage);
    }
  }
  return 'Hubo un problema inesperado. Intentémoslo de nuevo.';
}

export const __testing = Object.freeze({
  RATE_LIMIT_BACKOFF_MS,
  SHEETS_REQUEST_TIMEOUT_MS,
});
