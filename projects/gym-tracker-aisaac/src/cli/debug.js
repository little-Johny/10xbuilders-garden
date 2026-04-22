/**
 * Lightweight debug helper. Enabled by `AISAAC_DEBUG=1` (or `true`).
 * When off, all helpers are no-ops so production sessions stay clean.
 */

/** @returns {boolean} */
export function isDebugEnabled() {
  const raw = process.env.AISAAC_DEBUG;
  return raw === '1' || raw === 'true';
}

/**
 * Prints a debug line to stderr, prefixed for visibility. No-op unless
 * `AISAAC_DEBUG` is enabled.
 *
 * @param {string} scope
 * @param {string} message
 * @param {unknown} [payload]
 */
export function debugLog(scope, message, payload) {
  if (!isDebugEnabled()) return;
  const line = payload === undefined ? `[debug:${scope}] ${message}` : `[debug:${scope}] ${message} ${safeJson(payload)}`;
  process.stderr.write(`${line}\n`);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
