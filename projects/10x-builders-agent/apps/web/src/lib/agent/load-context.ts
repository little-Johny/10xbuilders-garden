import type { DbClient } from "@agents/db";
import { getProfile } from "@agents/db";
import type {
  IntegrationsContext,
} from "@agents/agent";
import type { UserIntegration, UserToolSetting } from "@agents/types";
import { loadIntegrationsContext } from "./integrations-context";

const DEFAULT_SYSTEM_PROMPT = "Eres un asistente útil que ayuda al usuario.";

export interface AgentTurnContext {
  systemPrompt: string;
  toolSettings: UserToolSetting[];
  integrations: UserIntegration[];
  integrationsContext: IntegrationsContext;
  timezone: string;
}

/**
 * Construye todo lo que `runAgent` necesita para un turno: system prompt
 * (con preámbulo temporal inyectado), tool settings, integraciones activas y
 * el `IntegrationsContext` con tokens descifrados en memoria.
 *
 * Antes este código estaba duplicado en `/api/chat`, el webhook de Telegram y
 * (ahora) `/api/scheduled-tasks/tick`. Lo unificamos en un único helper para
 * que (1) el preámbulo temporal aparezca en todos los canales y (2) cualquier
 * cambio en el contexto del agente toque un solo archivo.
 */
export async function loadAgentContext(
  db: DbClient,
  userId: string,
  opts: { now?: Date } = {},
): Promise<AgentTurnContext> {
  const now = opts.now ?? new Date();

  const profilePromise = getProfile(db, userId).catch(() => null);
  const toolSettingsPromise = db
    .from("user_tool_settings")
    .select("*")
    .eq("user_id", userId);
  const integrationsPromise = db
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");
  const integrationsContextPromise = loadIntegrationsContext(db, userId);

  const [profile, toolSettingsRes, integrationsRes, integrationsContext] =
    await Promise.all([
      profilePromise,
      toolSettingsPromise,
      integrationsPromise,
      integrationsContextPromise,
    ]);

  const timezone = profile?.timezone || "UTC";
  const userPrompt = profile?.agent_system_prompt || DEFAULT_SYSTEM_PROMPT;
  const systemPrompt = buildSystemPrompt(userPrompt, now, timezone);

  const toolSettings: UserToolSetting[] = (
    (toolSettingsRes.data ?? []) as Record<string, unknown>[]
  ).map((t) => ({
    id: t.id as string,
    user_id: t.user_id as string,
    tool_id: t.tool_id as string,
    enabled: t.enabled as boolean,
    config_json: (t.config_json as Record<string, unknown>) ?? {},
  }));

  const integrations: UserIntegration[] = (
    (integrationsRes.data ?? []) as Record<string, unknown>[]
  ).map((i) => ({
    id: i.id as string,
    user_id: i.user_id as string,
    provider: i.provider as string,
    scopes: (i.scopes as string[]) ?? [],
    status: i.status as "active" | "revoked" | "expired",
    created_at: i.created_at as string,
  }));

  return {
    systemPrompt,
    toolSettings,
    integrations,
    integrationsContext,
    timezone,
  };
}

/**
 * Antepone al system prompt del usuario un bloque con la fecha/hora/TZ del
 * momento del turno. El modelo lo necesita para resolver expresiones
 * relativas («mañana», «el viernes», «cada lunes a las 9am») cuando programa
 * tareas o crea eventos. Si no se inyecta, el modelo no sabe qué día es.
 */
function buildSystemPrompt(userPrompt: string, now: Date, timezone: string): string {
  const isoLocal = formatIsoWithOffset(now, timezone);
  const weekday = formatWeekday(now, timezone);
  const preamble = [
    "Contexto temporal:",
    `- Fecha y hora actual: ${isoLocal}`,
    `- Zona horaria del usuario: ${timezone}`,
    `- Día de la semana: ${weekday}`,
    "Usa este contexto para resolver expresiones relativas («mañana», «el viernes», «cada lunes a las 9am») cuando programes tareas o crees eventos. Las cron_expression se interpretan en esta zona horaria salvo que el usuario indique otra.",
  ].join("\n");
  return `${preamble}\n\n${userPrompt}`;
}

/** Devuelve la fecha en formato ISO8601 con offset de la TZ pedida. */
function formatIsoWithOffset(date: Date, timezone: string): string {
  // Intl.DateTimeFormat con timeZoneName: "longOffset" produce p.ej.
  // "GMT-05:00". Construimos el ISO local manualmente porque toLocaleString
  // no expone el offset en formato +HH:MM.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour") === "24" ? "00" : get("hour");
  const minute = get("minute");
  const second = get("second");
  const tzName = get("timeZoneName"); // "GMT-05:00" o "GMT"

  let offset = "+00:00";
  const match = tzName.match(/GMT([+-]\d{2}:?\d{2})?/);
  if (match && match[1]) {
    offset = match[1].includes(":") ? match[1] : `${match[1].slice(0, 3)}:${match[1].slice(3)}`;
  }

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

function formatWeekday(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    weekday: "long",
  }).format(date);
}
