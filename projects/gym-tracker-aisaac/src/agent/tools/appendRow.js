import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { appendRow } from '../../sheets/repository.js';
import { CATEGORY_KEYS } from '../../sheets/categories.js';
import { getUserMessage } from '../../sheets/errors.js';
import { withDebug } from './withDebug.js';

/**
 * Map of which logical fields belong to each category. Used to enforce
 * that the agent only sends fields relevant to the chosen category.
 */
const CATEGORY_FIELDS = Object.freeze(
  /** @type {Readonly<Record<import('../../sheets/categories.js').CategoryKey, readonly string[]>>} */ ({
    pesos: Object.freeze(['exercise', 'weightKg', 'reps', 'sets']),
    medidas: Object.freeze(['zone', 'measureCm']),
    cardio: Object.freeze(['activity', 'durationMin', 'distanceKm', 'avgHr']),
    peso_corporal: Object.freeze(['bodyWeightKg']),
  }),
);

const ALL_CATEGORY_FIELDS = Object.freeze([
  'exercise',
  'weightKg',
  'reps',
  'sets',
  'zone',
  'measureCm',
  'activity',
  'durationMin',
  'distanceKm',
  'avgHr',
  'bodyWeightKg',
]);

const schema = z
  .object({
    category: z
      .enum(/** @type {[string, ...string[]]} */ ([...CATEGORY_KEYS]))
      .describe('Categoría del registro.'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD')
      .optional()
      .describe('Fecha del registro en formato ISO YYYY-MM-DD. Por defecto, hoy.'),
    timezone: z.string().optional().describe('Zona horaria IANA opcional.'),
    exercise: z.string().min(1).optional(),
    weightKg: z.number().nonnegative().optional(),
    reps: z.number().int().nonnegative().optional(),
    sets: z.number().int().nonnegative().optional(),
    zone: z.string().min(1).optional(),
    measureCm: z.number().nonnegative().optional(),
    activity: z.string().min(1).optional(),
    durationMin: z.number().nonnegative().optional(),
    distanceKm: z.number().nonnegative().optional(),
    avgHr: z.number().nonnegative().optional(),
    bodyWeightKg: z.number().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    const allowed = new Set(
      CATEGORY_FIELDS[/** @type {import('../../sheets/categories.js').CategoryKey} */ (data.category)],
    );
    for (const field of ALL_CATEGORY_FIELDS) {
      const value = /** @type {Record<string, unknown>} */ (data)[field];
      if (value !== undefined && !allowed.has(field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `El campo "${field}" no aplica a la categoría "${data.category}".`,
        });
      }
    }
    const allowedArray = [...allowed];
    const provided = allowedArray.filter(
      (field) => /** @type {Record<string, unknown>} */ (data)[field] !== undefined,
    );
    if (provided.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Falta al menos un campo de la categoría "${data.category}".`,
      });
    }
  });

export const appendRowTool = tool(
  withDebug('append_row', async (input) => {
    try {
      const payload = /** @type {import('../../sheets/repository.js').AppendRowPayload} */ (
        /** @type {unknown} */ (input)
      );
      const result = await appendRow(payload);
      return JSON.stringify({ ok: true, headers: result.headers, row: result.row });
    } catch (error) {
      return JSON.stringify({ ok: false, error: getUserMessage(error) });
    }
  }),
  {
    name: 'append_row',
    description:
      'Registra un nuevo dato en el progress tracker como fila nueva (nunca sobreescribe). Solo incluye los campos relevantes a la categoría informada.',
    schema,
  },
);

export const __testing = Object.freeze({ CATEGORY_FIELDS, ALL_CATEGORY_FIELDS });
