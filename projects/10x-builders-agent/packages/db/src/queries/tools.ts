import type { DbClient } from "../client";
import type { UserToolSetting } from "@agents/types";

export async function getUserToolSettings(db: DbClient, userId: string) {
  const { data, error } = await db
    .from("user_tool_settings")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as UserToolSetting[];
}

export async function upsertToolSetting(
  db: DbClient,
  userId: string,
  toolId: string,
  enabled: boolean,
  configJson: Record<string, unknown> = {}
) {
  const { data, error } = await db
    .from("user_tool_settings")
    .upsert(
      { user_id: userId, tool_id: toolId, enabled, config_json: configJson },
      { onConflict: "user_id,tool_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as UserToolSetting;
}
