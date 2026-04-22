/**
 * Shared, user-facing formatters: ISO dates, Spanish weekday names, and
 * REPL boilerplate messages. All output stays in Spanish and free of
 * technical detail (guardrails §4.3, §6, §7.3).
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Resolves a `Date` and the timezone to use when formatting it.
 *
 * - Bare ISO date strings (`YYYY-MM-DD`) are interpreted as UTC midnight
 *   and formatted in UTC so the calendar day and weekday stay stable.
 * - Other inputs (timestamps, `Date` objects, current time) honor the
 *   user's runtime timezone by default.
 *
 * @param {Date | string | number | undefined} input
 * @param {string} [timeZone]
 * @returns {{ date: Date, timeZone: string | undefined }}
 */
function resolveDate(input, timeZone) {
  if (typeof input === 'string') {
    const match = ISO_DATE_RE.exec(input);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      return { date: new Date(Date.UTC(year, month, day)), timeZone: timeZone ?? 'UTC' };
    }
    return { date: new Date(input), timeZone };
  }
  if (input instanceof Date) return { date: input, timeZone };
  if (input == null) return { date: new Date(), timeZone };
  return { date: new Date(input), timeZone };
}

/**
 * Returns the ISO `YYYY-MM-DD` representation of a date in the given
 * timezone. Defaults to the system timezone when the input is a live
 * timestamp; bare ISO strings are echoed back stably.
 *
 * @param {Date | string | number | undefined} input
 * @param {string} [timeZone]
 * @returns {string}
 */
export function formatDateIso(input, timeZone) {
  const resolved = resolveDate(input, timeZone);
  if (Number.isNaN(resolved.date.getTime())) {
    throw new Error('Invalid date provided to formatDateIso');
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolved.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(resolved.date);
}

/**
 * Returns the Spanish weekday name with its first letter capitalized,
 * e.g. `Lunes`, `Martes`, ... `Domingo`. For bare ISO dates, the
 * weekday is stable regardless of the process timezone.
 *
 * @param {Date | string | number | undefined} input
 * @param {string} [timeZone]
 * @returns {string}
 */
export function formatWeekdayEs(input, timeZone) {
  const resolved = resolveDate(input, timeZone);
  if (Number.isNaN(resolved.date.getTime())) {
    throw new Error('Invalid date provided to formatWeekdayEs');
  }
  const formatter = new Intl.DateTimeFormat('es', {
    timeZone: resolved.timeZone,
    weekday: 'long',
  });
  const raw = formatter.format(resolved.date);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const WELCOME_LINES = Object.freeze([
  '¡Hola! Soy aisaac, tu compañero para registrar tu progreso en el gimnasio.',
  'Puedes contarme tus entrenamientos, pedirme análisis o salir cuando quieras escribiendo "salir".',
]);

const FAREWELL_LINES = Object.freeze([
  '¡Listo! Guardé lo que necesitabas. Nos vemos en el próximo entrenamiento.',
]);

/** @returns {string} */
export function renderWelcome() {
  return WELCOME_LINES.join('\n');
}

/** @returns {string} */
export function renderFarewell() {
  return FAREWELL_LINES.join('\n');
}

/**
 * @param {string} message Spanish, user-facing reason.
 * @returns {string}
 */
export function renderFatalError(message) {
  return `No puedo continuar la sesión: ${message}`;
}

/**
 * @param {string} message Spanish, user-facing reason.
 * @returns {string}
 */
export function renderRecoverableError(message) {
  return `Hubo un problema temporal: ${message}`;
}
