/**
 * Source of truth for the closed list of categories, header order, and
 * synonym normalization. Any change to scope, columns, or tracked metrics
 * must happen here (guardrails §1.2, §4.3).
 */

/**
 * @typedef {'pesos' | 'medidas' | 'cardio' | 'peso_corporal'} CategoryKey
 */

/** Closed list of category keys accepted by the agent. */
export const CATEGORY_KEYS = Object.freeze(
  /** @type {readonly CategoryKey[]} */ ([
    'pesos',
    'medidas',
    'cardio',
    'peso_corporal',
  ]),
);

/** Headers that are always present, in this exact order. */
export const BASE_HEADERS = Object.freeze(['Fecha', 'Día', 'Categoría']);

/**
 * Spanish, user-facing label for each category. Used by the onboarding
 * conversation and stored in the `Categoría` column of every row.
 */
export const CATEGORY_LABELS = Object.freeze(
  /** @type {Readonly<Record<CategoryKey, string>>} */ ({
    pesos: 'Pesos por ejercicio',
    medidas: 'Medidas corporales',
    cardio: 'Cardio',
    peso_corporal: 'Peso corporal',
  }),
);

/**
 * Columns added by each category, in canonical order (brief §4.3).
 */
export const CATEGORY_BLOCKS = Object.freeze(
  /** @type {Readonly<Record<CategoryKey, readonly string[]>>} */ ({
    pesos: Object.freeze(['Ejercicio', 'Peso (kg)', 'Repeticiones', 'Series']),
    medidas: Object.freeze(['Zona', 'Medida (cm)']),
    cardio: Object.freeze([
      'Actividad',
      'Duración (min)',
      'Distancia (km)',
      'FC promedio',
    ]),
    peso_corporal: Object.freeze(['Peso corporal (kg)']),
  }),
);

/**
 * Logical field name (used by `append_row` payloads) for each header.
 * Keep in sync with `CATEGORY_BLOCKS` and `BASE_HEADERS`.
 */
export const HEADER_TO_FIELD = Object.freeze(
  /** @type {Readonly<Record<string, string>>} */ ({
    Fecha: 'date',
    Día: 'weekday',
    Categoría: 'categoryLabel',
    Ejercicio: 'exercise',
    'Peso (kg)': 'weightKg',
    Repeticiones: 'reps',
    Series: 'sets',
    Zona: 'zone',
    'Medida (cm)': 'measureCm',
    Actividad: 'activity',
    'Duración (min)': 'durationMin',
    'Distancia (km)': 'distanceKm',
    'FC promedio': 'avgHr',
    'Peso corporal (kg)': 'bodyWeightKg',
  }),
);

/**
 * Synonyms accepted from the user; the value is the canonical header.
 * Lookup keys are lowercased for case-insensitive matching.
 */
export const HEADER_SYNONYMS = Object.freeze(
  /** @type {Readonly<Record<string, string>>} */ ({
    reps: 'Repeticiones',
    repes: 'Repeticiones',
    repeticiones: 'Repeticiones',
    series: 'Series',
    peso: 'Peso (kg)',
    'peso (kg)': 'Peso (kg)',
    kg: 'Peso (kg)',
    ejercicio: 'Ejercicio',
    zona: 'Zona',
    medida: 'Medida (cm)',
    'medida (cm)': 'Medida (cm)',
    cm: 'Medida (cm)',
    actividad: 'Actividad',
    duracion: 'Duración (min)',
    duración: 'Duración (min)',
    distancia: 'Distancia (km)',
    fc: 'FC promedio',
    'frecuencia cardiaca': 'FC promedio',
    'peso corporal': 'Peso corporal (kg)',
    fecha: 'Fecha',
    dia: 'Día',
    día: 'Día',
    categoria: 'Categoría',
    categoría: 'Categoría',
  }),
);

/**
 * Reverse lookup: header → category that owns it.
 */
const HEADER_TO_CATEGORY = (() => {
  /** @type {Record<string, CategoryKey>} */
  const map = {};
  for (const key of CATEGORY_KEYS) {
    for (const header of CATEGORY_BLOCKS[key]) {
      map[header] = key;
    }
  }
  return Object.freeze(map);
})();

/**
 * Builds the canonical header row for the given selection of categories.
 * The output always starts with `BASE_HEADERS` and then appends the
 * category blocks in `CATEGORY_KEYS` order, regardless of the input order.
 *
 * @param {readonly CategoryKey[]} selectedCategories
 * @returns {string[]}
 */
export function buildHeaders(selectedCategories) {
  if (!Array.isArray(selectedCategories) || selectedCategories.length === 0) {
    throw new Error('buildHeaders requires a non-empty list of categories');
  }
  const selected = new Set(selectedCategories);
  for (const key of selected) {
    if (!CATEGORY_KEYS.includes(/** @type {CategoryKey} */ (key))) {
      throw new Error(`Unknown category: ${String(key)}`);
    }
  }
  /** @type {string[]} */
  const headers = [...BASE_HEADERS];
  for (const key of CATEGORY_KEYS) {
    if (selected.has(key)) {
      headers.push(...CATEGORY_BLOCKS[key]);
    }
  }
  return headers;
}

/**
 * Infers the active categories present in a sheet by scanning its header
 * row. Tolerates arbitrary order and unrelated extra columns.
 *
 * @param {readonly string[] | null | undefined} headers
 * @returns {CategoryKey[]}
 */
export function inferCategoriesFromHeaders(headers) {
  if (!headers || headers.length === 0) return [];
  /** @type {Set<CategoryKey>} */
  const found = new Set();
  for (const header of headers) {
    const owner = HEADER_TO_CATEGORY[header];
    if (owner) found.add(owner);
  }
  return CATEGORY_KEYS.filter((key) => found.has(key));
}

/**
 * Normalizes a header-like input from the user into a canonical header,
 * if a synonym is registered. Returns `null` when no mapping exists.
 *
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeHeader(raw) {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  return HEADER_SYNONYMS[key] ?? null;
}

/**
 * Returns true when the sheet header row should trigger onboarding.
 * @param {readonly string[] | null | undefined} headers
 */
export function isOnboardingRequired(headers) {
  if (!headers) return true;
  const meaningful = headers.filter((cell) => typeof cell === 'string' && cell.trim().length > 0);
  return meaningful.length === 0;
}
