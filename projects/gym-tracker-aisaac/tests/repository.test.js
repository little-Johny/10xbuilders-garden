import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestEnv, clearTestEnv } from './helpers/env.js';
import { setSheetsClientForTests } from '../src/sheets/client.js';
import {
  appendRow,
  addColumns,
  readHeaders,
  readHistory,
  writeHeaders,
  columnIndexToA1,
} from '../src/sheets/repository.js';

/**
 * Builds a googleapis-shaped mock client where each `values.*` method
 * is a Vitest mock returning the queued response.
 */
function buildMockClient({ getValues = [], appendCalls = [], updateCalls = [] } = {}) {
  const get = vi.fn(async () => ({ data: { values: getValues } }));
  const append = vi.fn(async (args) => {
    appendCalls.push(args);
    return { data: {} };
  });
  const update = vi.fn(async (args) => {
    updateCalls.push(args);
    return { data: {} };
  });
  return {
    spreadsheets: { values: { get, append, update } },
    appendCalls,
    updateCalls,
    get,
    append,
    update,
  };
}

beforeEach(() => {
  setupTestEnv();
});

afterEach(() => {
  setSheetsClientForTests(null);
  clearTestEnv();
});

describe('readHeaders', () => {
  it('uses the configured tab and trims empty cells', async () => {
    const mock = buildMockClient({ getValues: [['Fecha', 'Día', 'Categoría', '']] });
    setSheetsClientForTests(/** @type {any} */ (mock));
    const headers = await readHeaders();
    expect(headers).toEqual(['Fecha', 'Día', 'Categoría']);
    expect(mock.get).toHaveBeenCalledWith({
      spreadsheetId: 'test-spreadsheet',
      range: 'progress_tracker!A1:Z1',
    });
  });
});

describe('writeHeaders', () => {
  it('writes canonical headers via update on row 1 only', async () => {
    const mock = buildMockClient();
    setSheetsClientForTests(/** @type {any} */ (mock));
    const result = await writeHeaders(['cardio', 'pesos']);
    expect(result.headers[0]).toBe('Fecha');
    expect(mock.update).toHaveBeenCalledTimes(1);
    const args = mock.update.mock.calls[0][0];
    expect(args.range).toBe('progress_tracker!A1');
    expect(args.valueInputOption).toBe('RAW');
    expect(mock.append).not.toHaveBeenCalled();
  });
});

describe('addColumns', () => {
  it('adds only missing columns and preserves existing ones', async () => {
    const mock = buildMockClient({
      getValues: [['Fecha', 'Día', 'Categoría', 'Ejercicio', 'Peso (kg)', 'Repeticiones', 'Series']],
    });
    setSheetsClientForTests(/** @type {any} */ (mock));
    const result = await addColumns('cardio');
    expect(result.added).toEqual(['Actividad', 'Duración (min)', 'Distancia (km)', 'FC promedio']);
    const updateArgs = mock.update.mock.calls[0][0];
    expect(updateArgs.range).toBe('progress_tracker!H1');
    expect(updateArgs.requestBody.values[0]).toEqual(result.added);
  });

  it('does not duplicate columns when category is already active', async () => {
    const mock = buildMockClient({
      getValues: [['Fecha', 'Día', 'Categoría', 'Actividad', 'Duración (min)', 'Distancia (km)', 'FC promedio']],
    });
    setSheetsClientForTests(/** @type {any} */ (mock));
    const result = await addColumns('cardio');
    expect(result.added).toEqual([]);
    expect(mock.update).not.toHaveBeenCalled();
  });
});

describe('appendRow', () => {
  it('uses values.append exclusively (immutable history)', async () => {
    const mock = buildMockClient({
      getValues: [['Fecha', 'Día', 'Categoría', 'Ejercicio', 'Peso (kg)', 'Repeticiones', 'Series']],
    });
    setSheetsClientForTests(/** @type {any} */ (mock));
    await appendRow({
      category: 'pesos',
      date: '2026-04-20',
      exercise: 'Press de banca',
      weightKg: 60,
      reps: 10,
      sets: 4,
    });
    expect(mock.append).toHaveBeenCalledTimes(1);
    expect(mock.update).not.toHaveBeenCalled();
    const args = mock.append.mock.calls[0][0];
    expect(args.range.startsWith('progress_tracker!')).toBe(true);
    expect(args.valueInputOption).toBe('USER_ENTERED');
    expect(args.requestBody.values[0]).toEqual([
      '2026-04-20',
      'Lunes',
      'Pesos por ejercicio',
      'Press de banca',
      60,
      10,
      4,
    ]);
  });

  it('maps to the current header order even when extra columns exist', async () => {
    const mock = buildMockClient({
      getValues: [
        [
          'Fecha',
          'Día',
          'Categoría',
          'Ejercicio',
          'Peso (kg)',
          'Repeticiones',
          'Series',
          'Peso corporal (kg)',
        ],
      ],
    });
    setSheetsClientForTests(/** @type {any} */ (mock));
    await appendRow({
      category: 'peso_corporal',
      date: '2026-04-21',
      bodyWeightKg: 78.5,
    });
    const row = mock.append.mock.calls[0][0].requestBody.values[0];
    expect(row).toHaveLength(8);
    expect(row[2]).toBe('Peso corporal');
    expect(row[7]).toBe(78.5);
    expect(row[3]).toBe('');
  });

  it('refuses to append when headers are missing', async () => {
    const mock = buildMockClient({ getValues: [] });
    setSheetsClientForTests(/** @type {any} */ (mock));
    await expect(
      appendRow({ category: 'peso_corporal', bodyWeightKg: 78 }),
    ).rejects.toThrow();
  });
});

describe('readHistory', () => {
  it('filters by category and exercise and respects limit', async () => {
    const headers = [
      'Fecha',
      'Día',
      'Categoría',
      'Ejercicio',
      'Peso (kg)',
      'Repeticiones',
      'Series',
    ];
    const rows = [
      ['2026-04-10', 'Viernes', 'Pesos por ejercicio', 'Press de banca', '50', '10', '3'],
      ['2026-04-12', 'Domingo', 'Pesos por ejercicio', 'Sentadilla', '80', '8', '4'],
      ['2026-04-15', 'Miércoles', 'Pesos por ejercicio', 'Press de banca', '55', '10', '3'],
      ['2026-04-20', 'Lunes', 'Cardio', 'Correr', '', '', ''],
    ];
    const mock = buildMockClient({ getValues: [headers, ...rows] });
    setSheetsClientForTests(/** @type {any} */ (mock));
    const result = await readHistory({ category: 'pesos', exercise: 'press', limit: 1 });
    expect(result.activeCategories).toContain('pesos');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]['Fecha']).toBe('2026-04-15');
    const args = mock.get.mock.calls[0][0];
    expect(args.range).toBe('progress_tracker!A:Z');
  });
});

describe('columnIndexToA1', () => {
  it('handles the basic alphabet and boundaries', () => {
    expect(columnIndexToA1(0)).toBe('A');
    expect(columnIndexToA1(7)).toBe('H');
    expect(columnIndexToA1(25)).toBe('Z');
    expect(columnIndexToA1(26)).toBe('AA');
    expect(columnIndexToA1(27)).toBe('AB');
  });

  it('rejects negative indices', () => {
    expect(() => columnIndexToA1(-1)).toThrow();
  });
});
