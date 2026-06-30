import type { DbClient } from "../client";
import type { UserSheet } from "@agents/types";

/** Tope defensivo de hojas a inyectar en el contexto del agente. */
const MAX_SHEETS = 50;

/** Alias case-insensitive: normalizamos al guardar y al resolver. */
function normaliseAlias(alias: string): string {
  return alias.trim().toLowerCase();
}

export interface UpsertUserSheetInput {
  alias: string;
  spreadsheetId: string;
  defaultTab?: string | null;
  description?: string | null;
}

export async function listUserSheets(db: DbClient, userId: string) {
  const { data, error } = await db
    .from("user_sheets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(MAX_SHEETS);
  if (error) throw error;
  return (data ?? []) as UserSheet[];
}

/**
 * Registra o actualiza una referencia de hoja. Idempotente por
 * (user_id, alias): re-guardar un alias existente actualiza la fila en vez de
 * duplicarla. El alias se normaliza (trim + lowercase) para que "Gym" y "gym"
 * sean la misma referencia.
 */
export async function upsertUserSheet(
  db: DbClient,
  userId: string,
  input: UpsertUserSheetInput,
) {
  const insert = {
    user_id: userId,
    alias: normaliseAlias(input.alias),
    spreadsheet_id: input.spreadsheetId,
    default_tab: input.defaultTab ?? null,
    description: input.description ?? null,
  };
  const { data, error } = await db
    .from("user_sheets")
    .upsert(insert, { onConflict: "user_id,alias" })
    .select()
    .single();
  if (error) throw error;
  return data as UserSheet;
}

export async function deleteUserSheet(db: DbClient, userId: string, alias: string) {
  const { data, error } = await db
    .from("user_sheets")
    .delete()
    .eq("user_id", userId)
    .eq("alias", normaliseAlias(alias))
    .select("id");
  if (error) throw error;
  return { deleted: (data?.length ?? 0) > 0 };
}
