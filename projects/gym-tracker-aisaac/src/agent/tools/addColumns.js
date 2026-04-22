import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { addColumns } from '../../sheets/repository.js';
import { CATEGORY_KEYS } from '../../sheets/categories.js';
import { getUserMessage } from '../../sheets/errors.js';
import { withDebug } from './withDebug.js';

const schema = z.object({
  category: z
    .enum(/** @type {[string, ...string[]]} */ ([...CATEGORY_KEYS]))
    .describe('Categoría que se quiere activar después del onboarding.'),
});

export const addColumnsTool = tool(
  withDebug('add_columns', async ({ category }) => {
    try {
      const result = await addColumns(
        /** @type {import('../../sheets/categories.js').CategoryKey} */ (category),
      );
      if (result.added.length === 0) {
        return JSON.stringify({
          ok: true,
          alreadyActive: true,
          headers: result.headers,
        });
      }
      return JSON.stringify({
        ok: true,
        alreadyActive: false,
        added: result.added,
        headers: result.headers,
      });
    } catch (error) {
      return JSON.stringify({ ok: false, error: getUserMessage(error) });
    }
  }),
  {
    name: 'add_columns',
    description:
      'Activa una nueva categoría en el progress tracker añadiendo sus columnas al final, sin afectar los datos previos.',
    schema,
  },
);
