import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const currentTimeTool = tool(
  async ({ includeDate }) => {
    const now = new Date();
    const time = now.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    if (includeDate) {
      const date = now.toISOString().slice(0, 10);
      return `${date} ${time}`;
    }

    return time;
  },
  {
    name: "current_time",
    description:
      "Devuelve la hora actual. Con includeDate: true también devuelve la fecha en formato YYYY-MM-DD.",
    schema: z.object({
      includeDate: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Si es true, retorna fecha y hora (YYYY-MM-DD HH:MM:SS). Si es false, solo hora.",
        ),
    }),
  },
);
