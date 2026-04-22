import { describe, expect, it } from 'vitest';
import {
  BASE_HEADERS,
  CATEGORY_BLOCKS,
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  HEADER_SYNONYMS,
  buildHeaders,
  inferCategoriesFromHeaders,
  isOnboardingRequired,
  normalizeHeader,
} from '../src/sheets/categories.js';

describe('categories module', () => {
  it('keeps the closed list of categories frozen', () => {
    expect(Object.isFrozen(CATEGORY_KEYS)).toBe(true);
    expect(Object.isFrozen(CATEGORY_BLOCKS)).toBe(true);
    expect(Object.isFrozen(CATEGORY_LABELS)).toBe(true);
    expect(Object.isFrozen(HEADER_SYNONYMS)).toBe(true);
    expect([...CATEGORY_KEYS]).toEqual(['pesos', 'medidas', 'cardio', 'peso_corporal']);
  });

  it('builds headers in canonical order regardless of input order', () => {
    const headers = buildHeaders(['cardio', 'pesos']);
    expect(headers).toEqual([
      ...BASE_HEADERS,
      'Ejercicio',
      'Peso (kg)',
      'Repeticiones',
      'Series',
      'Actividad',
      'Duración (min)',
      'Distancia (km)',
      'FC promedio',
    ]);
  });

  it('builds headers for all four categories', () => {
    const headers = buildHeaders(['pesos', 'medidas', 'cardio', 'peso_corporal']);
    expect(headers.slice(0, 3)).toEqual(BASE_HEADERS);
    expect(headers).toContain('Peso corporal (kg)');
    expect(headers).toContain('Medida (cm)');
  });

  it('rejects unknown categories', () => {
    expect(() => buildHeaders(/** @type {any} */ (['nutricion']))).toThrow();
  });

  it('rejects empty category lists', () => {
    expect(() => buildHeaders(/** @type {any} */ ([]))).toThrow();
  });

  it('infers categories from arbitrary header order with extra columns', () => {
    const headers = [
      'Categoría',
      'Fecha',
      'Día',
      'FC promedio',
      'Actividad',
      'Notas',
      'Peso (kg)',
      'Ejercicio',
    ];
    expect(inferCategoriesFromHeaders(headers)).toEqual(['pesos', 'cardio']);
  });

  it('returns no categories for empty headers', () => {
    expect(inferCategoriesFromHeaders([])).toEqual([]);
    expect(inferCategoriesFromHeaders(null)).toEqual([]);
  });

  it('treats blank header rows as onboarding required', () => {
    expect(isOnboardingRequired(null)).toBe(true);
    expect(isOnboardingRequired([])).toBe(true);
    expect(isOnboardingRequired(['', '   '])).toBe(true);
    expect(isOnboardingRequired(['Fecha'])).toBe(false);
  });

  it('normalizes user-provided header synonyms', () => {
    expect(normalizeHeader('reps')).toBe('Repeticiones');
    expect(normalizeHeader('REPES')).toBe('Repeticiones');
    expect(normalizeHeader('  Peso  ')).toBe('Peso (kg)');
    expect(normalizeHeader('inventado')).toBeNull();
    expect(normalizeHeader(/** @type {any} */ (123))).toBeNull();
  });
});
