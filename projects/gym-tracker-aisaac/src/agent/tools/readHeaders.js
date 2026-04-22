import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readHeaders } from '../../sheets/repository.js';
import {
  inferCategoriesFromHeaders,
  isOnboardingRequired,
} from '../../sheets/categories.js';
import { getUserMessage } from '../../sheets/errors.js';
import { withDebug } from './withDebug.js';

export const readHeadersTool = tool(
  withDebug('read_headers', async () => {
    try {
      const headers = await readHeaders();
      const isEmpty = isOnboardingRequired(headers);
      const activeCategories = inferCategoriesFromHeaders(headers);
      return JSON.stringify({ ok: true, headers, isEmpty, activeCategories });
    } catch (error) {
      return JSON.stringify({ ok: false, error: getUserMessage(error) });
    }
  }),
  {
    name: 'read_headers',
    description:
      'Lee la fila de headers del progress tracker para detectar si hace falta onboarding e inferir las categorías activas. Llama a esta herramienta antes de cualquier otra acción.',
    schema: z.object({}),
  },
);
