import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupTestEnv, clearTestEnv } from './helpers/env.js';
import { setSheetsClientForTests } from '../src/sheets/client.js';
import { readHeadersTool } from '../src/agent/tools/readHeaders.js';
import { writeHeadersTool } from '../src/agent/tools/writeHeaders.js';
import { addColumnsTool } from '../src/agent/tools/addColumns.js';
import { appendRowTool } from '../src/agent/tools/appendRow.js';
import { readHistoryTool } from '../src/agent/tools/readHistory.js';
import { CATEGORY_KEYS } from '../src/sheets/categories.js';

/**
 * Builds a googleapis-shaped mock client.
 */
function buildMockClient(getValues = []) {
  const get = async () => ({ data: { values: getValues } });
  const append = async () => ({ data: {} });
  const update = async () => ({ data: {} });
  return {
    spreadsheets: { values: { get, append, update } },
  };
}

beforeEach(() => setupTestEnv());
afterEach(() => {
  setSheetsClientForTests(null);
  clearTestEnv();
});

describe('tool schemas', () => {
  it('none of the tools accept spreadsheetId or sheet name as input', () => {
    for (const t of [
      readHeadersTool,
      writeHeadersTool,
      addColumnsTool,
      appendRowTool,
      readHistoryTool,
    ]) {
      const json = JSON.stringify(t.schema ?? {});
      expect(json).not.toMatch(/spreadsheetId/i);
      expect(json).not.toMatch(/sheetName/i);
    }
  });

  it('write_headers rejects unknown categories at schema validation', async () => {
    await expect(
      writeHeadersTool.invoke({ categories: /** @type {any} */ (['nutricion']) }),
    ).rejects.toThrow();
  });

  it('write_headers accepts only the four canonical keys', () => {
    expect([...CATEGORY_KEYS].sort()).toEqual(
      ['cardio', 'medidas', 'peso_corporal', 'pesos'].sort(),
    );
  });
});

describe('read_headers tool', () => {
  it('returns isEmpty=true for an empty sheet', async () => {
    setSheetsClientForTests(/** @type {any} */ (buildMockClient([])));
    const raw = await readHeadersTool.invoke({});
    const parsed = JSON.parse(String(raw));
    expect(parsed.ok).toBe(true);
    expect(parsed.isEmpty).toBe(true);
    expect(parsed.activeCategories).toEqual([]);
  });

  it('infers active categories when headers exist', async () => {
    setSheetsClientForTests(
      /** @type {any} */ (
        buildMockClient([['Fecha', 'Día', 'Categoría', 'Ejercicio', 'Peso (kg)', 'Repeticiones', 'Series']])
      ),
    );
    const parsed = JSON.parse(String(await readHeadersTool.invoke({})));
    expect(parsed.ok).toBe(true);
    expect(parsed.isEmpty).toBe(false);
    expect(parsed.activeCategories).toEqual(['pesos']);
  });
});

describe('append_row tool', () => {
  it('rejects fields from a different category at schema validation', async () => {
    setSheetsClientForTests(
      /** @type {any} */ (
        buildMockClient([['Fecha', 'Día', 'Categoría', 'Peso corporal (kg)']])
      ),
    );
    await expect(
      appendRowTool.invoke({
        category: 'peso_corporal',
        bodyWeightKg: 78,
        weightKg: 60,
      }),
    ).rejects.toThrow();
  });

  it('rejects calls without any category-relevant field at schema validation', async () => {
    setSheetsClientForTests(
      /** @type {any} */ (
        buildMockClient([['Fecha', 'Día', 'Categoría', 'Peso corporal (kg)']])
      ),
    );
    await expect(
      appendRowTool.invoke({ category: 'peso_corporal' }),
    ).rejects.toThrow();
  });

  it('returns a deterministic ok JSON on success', async () => {
    setSheetsClientForTests(
      /** @type {any} */ (
        buildMockClient([['Fecha', 'Día', 'Categoría', 'Peso corporal (kg)']])
      ),
    );
    const raw = await appendRowTool.invoke({
      category: 'peso_corporal',
      date: '2026-04-21',
      bodyWeightKg: 78,
    });
    const parsed = JSON.parse(String(raw));
    expect(parsed.ok).toBe(true);
    expect(parsed.row).toEqual(['2026-04-21', 'Martes', 'Peso corporal', 78]);
  });
});
