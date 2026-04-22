import { debugLog } from '../../cli/debug.js';

/**
 * Wraps a tool handler so that every call and its return value is
 * logged when `AISAAC_DEBUG` is enabled. Truncates long payloads to
 * keep the CLI readable.
 *
 * @template {Record<string, unknown>} T
 * @param {string} name
 * @param {(input: T) => Promise<string>} handler
 * @returns {(input: T) => Promise<string>}
 */
export function withDebug(name, handler) {
  return async (input) => {
    debugLog(`tool:${name}`, 'invoked', input);
    const result = await handler(input);
    const preview = typeof result === 'string' && result.length > 400
      ? `${result.slice(0, 400)}…(truncated)`
      : result;
    debugLog(`tool:${name}`, 'returned', preview);
    return result;
  };
}
