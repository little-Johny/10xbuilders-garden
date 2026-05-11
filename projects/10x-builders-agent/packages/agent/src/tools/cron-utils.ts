// Helpers de cron compartidos por la tool create_scheduled_task y por el
// endpoint /api/scheduled-tasks/tick. Encapsulan la dependencia `cron-parser`
// para que cualquier cambio futuro de versión solo toque este archivo.
//
// Compat: usa la API `parseExpression` de cron-parser v4.x.
import { parseExpression } from "cron-parser";
import cronstrue from "cronstrue";
import "cronstrue/locales/es";

export interface CronEvalResult {
  /** Próxima ejecución después de `from`, en ISO8601 con offset. */
  nextIso: string;
  /** Descripción humana en español de la expresión. */
  human: string;
}

/**
 * Valida + calcula la próxima ejecución de una cron expression.
 * Lanza Error con mensaje legible si la expresión es inválida.
 */
export function evaluateCron(
  expression: string,
  opts: { from: Date; timezone?: string },
): CronEvalResult {
  let interval;
  try {
    interval = parseExpression(expression, {
      currentDate: opts.from,
      tz: opts.timezone,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`cron_expression inválida: ${msg}`);
  }
  const nextIso = interval.next().toDate().toISOString();
  let human: string;
  try {
    human = cronstrue.toString(expression, { locale: "es" });
  } catch {
    human = expression;
  }
  return { nextIso, human };
}

/**
 * Valida sin lanzar; devuelve null si la expresión es válida o el mensaje de
 * error si no. Útil para retornar errores como datos al modelo.
 */
export function validateCron(expression: string, timezone?: string): string | null {
  try {
    parseExpression(expression, { currentDate: new Date(), tz: timezone });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
