import type { DbClient } from "../client";
import type { Profile } from "@agents/types";

export async function getProfile(db: DbClient, userId: string) {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function upsertProfile(
  db: DbClient,
  userId: string,
  fields: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>
) {
  const { data, error } = await db
    .from("profiles")
    .upsert({ id: userId, ...fields, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}
