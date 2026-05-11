import { getEnv } from '../config/env.js';
import { getSheetsClient } from './client.js';
import { withSheetsErrorHandling } from './errors.js';
import {
  BASE_HEADERS,
  CATEGORY_BLOCKS,
  CATEGORY_LABELS,
  HEADER_TO_FIELD,
  buildHeaders,
  inferCategoriesFromHeaders,
} from './categories.js';
import { formatDateIso, formatWeekdayEs } from '../cli/formatters.js';

/**
 * Repository: every Google Sheets read/write goes through here. The
 * spreadsheet id and tab name are taken from the validated environment;
 * **no function in this module accepts them as parameters** (guardrails
 * §3.1, §3.2). Writes to data rows use exclusively `values.append` to
 * preserve immutable history (§3.4).
 */

/** @returns {{ spreadsheetId: string, sheetName: string }} */
function getTarget() {
  const env = getEnv();
  return { spreadsheetId: env.SPREADSHEET_ID, sheetName: env.SHEET_NAME };
}

/**
 * Returns the headers row (`A1:Z1`) of the configured tab.
 * Empty cells are stripped so callers can detect onboarding state.
 *
 * @returns {Promise<string[]>}
 */
export async function readHeaders() {
  const { spreadsheetId, sheetName } = getTarget();
  const sheets = getSheetsClient();
  const range = `${sheetName}!A1:Z1`;
  const response = await withSheetsErrorHandling('readHeaders', () =>
    sheets.spreadsheets.values.get({ spreadsheetId, range }),
  );
  const row = response?.data?.values?.[0] ?? [];
  return row
    .map((cell) => (typeof cell === 'string' ? cell : String(cell ?? '')))
    .filter((cell) => cell.trim().length > 0);
}

/**
 * Writes the canonical header row for the selected categories. Used only
 * by the onboarding tool. Always operates on row 1.
 *
 * @param {readonly import('./categories.js').CategoryKey[]} selectedCategories
 * @returns {Promise<{ headers: string[] }>}
 */
export async function writeHeaders(selectedCategories) {
  const { spreadsheetId, sheetName } = getTarget();
  const sheets = getSheetsClient();
  const headers = buildHeaders(selectedCategories);
  await withSheetsErrorHandling('writeHeaders', () =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    }),
  );
  return { headers };
}

/**
 * Adds the columns of a new category at the right edge of the existing
 * header row, preserving previous data. Refuses to act if the category
 * is already active.
 *
 * @param {import('./categories.js').CategoryKey} category
 * @returns {Promise<{ added: string[], headers: string[] }>}
 */
export async function addColumns(category) {
  const { spreadsheetId, sheetName } = getTarget();
  const sheets = getSheetsClient();
  const current = await readHeaders();
  const existing = new Set(current);
  const block = CATEGORY_BLOCKS[category];
  if (!block) {
    throw new Error(`Unknown category: ${String(category)}`);
  }
  const toAdd = block.filter((header) => !existing.has(header));
  if (toAdd.length === 0) {
    return { added: [], headers: [...current] };
  }
  const startColumn = columnIndexToA1(current.length);
  const range = `${sheetName}!${startColumn}1`;
  await withSheetsErrorHandling('addColumns', () =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [toAdd] },
    }),
  );
  return { added: toAdd, headers: [...current, ...toAdd] };
}

/**
 * @typedef {object} AppendRowPayload
 * @property {import('./categories.js').CategoryKey} category
 * @property {string} [date] ISO `YYYY-MM-DD`. Defaults to today in the user's timezone.
 * @property {string} [timezone] IANA timezone override for date/weekday.
 * @property {string} [exercise]
 * @property {number} [weightKg]
 * @property {number} [reps]
 * @property {number} [sets]
 * @property {string} [zone]
 * @property {number} [measureCm]
 * @property {string} [activity]
 * @property {number} [durationMin]
 * @property {number} [distanceKm]
 * @property {number} [avgHr]
 * @property {number} [bodyWeightKg]
 */

/**
 * Appends a single row to the configured tab. Re-reads headers so the
 * payload is mapped against the current column order even if categories
 * were added since last call. Always uses `values.append`; never `update`
 * (guardrail §3.4).
 *
 * @param {AppendRowPayload} payload
 * @returns {Promise<{ headers: string[], row: (string | number | null)[] }>}
 */
export async function appendRow(payload) {
  const { spreadsheetId, sheetName } = getTarget();
  const sheets = getSheetsClient();
  const headers = await readHeaders();
  if (headers.length === 0) {
    throw new Error('Cannot append a row before headers are written');
  }
  const date = payload.date ?? formatDateIso(undefined, payload.timezone);
  const weekday = formatWeekdayEs(date, payload.timezone);
  const categoryLabel = CATEGORY_LABELS[payload.category];
  if (!categoryLabel) {
    throw new Error(`Unknown category: ${String(payload.category)}`);
  }
  /** @type {Record<string, string | number | null>} */
  const fieldValues = {
    date,
    weekday,
    categoryLabel,
    exercise: payload.exercise ?? null,
    weightKg: payload.weightKg ?? null,
    reps: payload.reps ?? null,
    sets: payload.sets ?? null,
    zone: payload.zone ?? null,
    measureCm: payload.measureCm ?? null,
    activity: payload.activity ?? null,
    durationMin: payload.durationMin ?? null,
    distanceKm: payload.distanceKm ?? null,
    avgHr: payload.avgHr ?? null,
    bodyWeightKg: payload.bodyWeightKg ?? null,
  };
  const row = headers.map((header) => {
    const fieldName = HEADER_TO_FIELD[header];
    if (!fieldName) return '';
    const value = fieldValues[fieldName];
    if (value === null || value === undefined) return '';
    return value;
  });
  await withSheetsErrorHandling('appendRow', () =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    }),
  );
  return { headers, row };
}

/**
 * @typedef {object} ReadHistoryFilter
 * @property {import('./categories.js').CategoryKey} [category]
 * @property {string} [exercise]
 * @property {number} [limit]
 */

/**
 * Reads all data rows and reconstructs them as objects keyed by header.
 * Filters in memory by category and/or exercise and applies a limit.
 *
 * @param {ReadHistoryFilter} [filter]
 * @returns {Promise<{ headers: string[], rows: Record<string, string>[], activeCategories: import('./categories.js').CategoryKey[] }>}
 */
export async function readHistory(filter = {}) {
  const { spreadsheetId, sheetName } = getTarget();
  const sheets = getSheetsClient();
  const range = `${sheetName}!A:Z`;
  const response = await withSheetsErrorHandling('readHistory', () =>
    sheets.spreadsheets.values.get({ spreadsheetId, range }),
  );
  const values = response?.data?.values ?? [];
  if (values.length === 0) {
    return { headers: [], rows: [], activeCategories: [] };
  }
  const headers = values[0]
    .map((cell) => (typeof cell === 'string' ? cell : String(cell ?? '')))
    .filter((cell) => cell.trim().length > 0);
  const dataRows = values.slice(1);
  /** @type {Record<string, string>[]} */
  const rows = dataRows.map((row) => {
    /** @type {Record<string, string>} */
    const obj = {};
    headers.forEach((header, idx) => {
      const cell = row[idx];
      obj[header] = cell == null ? '' : String(cell);
    });
    return obj;
  });
  let filtered = rows;
  if (filter.category) {
    const label = CATEGORY_LABELS[filter.category];
    if (label) {
      filtered = filtered.filter((row) => row['Categoría'] === label);
    }
  }
  if (filter.exercise) {
    const needle = filter.exercise.trim().toLowerCase();
    filtered = filtered.filter((row) => {
      const exercise = (row['Ejercicio'] ?? '').toLowerCase();
      const activity = (row['Actividad'] ?? '').toLowerCase();
      return exercise.includes(needle) || activity.includes(needle);
    });
  }
  filtered = [...filtered].sort((a, b) => {
    const dateA = a['Fecha'] ?? '';
    const dateB = b['Fecha'] ?? '';
    return dateB.localeCompare(dateA);
  });
  if (filter.limit && filter.limit > 0) {
    filtered = filtered.slice(0, filter.limit);
  }
  return {
    headers,
    rows: filtered,
    activeCategories: inferCategoriesFromHeaders(headers),
  };
}

/**
 * Converts a 0-based column index into A1 notation (0 → A, 25 → Z, 26 → AA).
 * @param {number} index
 * @returns {string}
 */
export function columnIndexToA1(index) {
  if (index < 0 || !Number.isInteger(index)) {
    throw new Error(`Invalid column index: ${index}`);
  }
  let n = index;
  let result = '';
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/**
 * Headers that always exist before any category-specific column.
 */
export const ALWAYS_PRESENT_HEADERS = BASE_HEADERS;
