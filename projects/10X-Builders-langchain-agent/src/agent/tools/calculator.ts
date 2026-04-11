import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const calculatorTool = tool(
  async ({ expression }) => {
    const result = Function(`"use strict"; return (${expression})`)();
    return String(result);
  },
  {
    name: 'calculator',
    description: 'Evalúa operaciones matemáticas simples.',
    schema: z.object({
      expression: z.string().describe('Expresión matemática, por ejemplo: 240 * 0.25'),
    }),
  },
);
