import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readHistory } from '../../sheets/repository.js';
import { CATEGORY_KEYS } from '../../sheets/categories.js';
import { getUserMessage } from '../../sheets/errors.js';
import { withDebug } from './withDebug.js';

const schema = z.object({
  category: z
    .enum(/** @type {[string, ...string[]]} */ ([...CATEGORY_KEYS]))
    .optional()
    .describe('Filtra los registros a una categoría concreta.'),
  exercise: z
    .string()
    .min(1)
    .optional()
    .describe('Filtra por nombre de ejercicio o actividad (case-insensitive).'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Máximo de registros a devolver (más recientes primero).'),
});

export const readHistoryTool = tool(
  withDebug('read_history', async (input) => {
    try {
      const filter = {
        ...input,
        category: /** @type {import('../../sheets/categories.js').CategoryKey | undefined} */ (
          input.category
        ),
      };
      const result = await readHistory(filter);
      return JSON.stringify({
        ok: true,
        headers: result.headers,
        rows: result.rows,
        activeCategories: result.activeCategories,
      });
    } catch (error) {
      return JSON.stringify({ ok: false, error: getUserMessage(error) });
    }
  }),
  {
    name: 'read_history',
    description:
      'Consulta el histórico del progress tracker. Úsala antes de registrar pesos o peso corporal para detectar saltos sospechosos, y para responder preguntas o análisis basados en datos reales.',
    schema,
  },
);
