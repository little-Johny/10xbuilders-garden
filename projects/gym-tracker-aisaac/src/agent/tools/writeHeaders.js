import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { writeHeaders } from '../../sheets/repository.js';
import { CATEGORY_KEYS } from '../../sheets/categories.js';
import { getUserMessage } from '../../sheets/errors.js';
import { withDebug } from './withDebug.js';

const schema = z.object({
  categories: z
    .array(z.enum(/** @type {[string, ...string[]]} */ ([...CATEGORY_KEYS])))
    .min(1)
    .describe('Lista de categorías seleccionadas durante el onboarding.'),
});

export const writeHeadersTool = tool(
  withDebug('write_headers', async ({ categories }) => {
    try {
      const list = /** @type {string[]} */ (categories);
      const unique = Array.from(new Set(list));
      const result = await writeHeaders(
        /** @type {import('../../sheets/categories.js').CategoryKey[]} */ (unique),
      );
      return JSON.stringify({ ok: true, headers: result.headers });
    } catch (error) {
      return JSON.stringify({ ok: false, error: getUserMessage(error) });
    }
  }),
  {
    name: 'write_headers',
    description:
      'Escribe los headers iniciales del progress tracker durante el onboarding según las categorías seleccionadas por el usuario. Solo se usa la primera vez.',
    schema,
  },
);
