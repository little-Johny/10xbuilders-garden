import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type DbClient = SupabaseClient;

export function createServerClient(): DbClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server env vars");
  return createClient(url, key);
}

export function createBrowserClient(): DbClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase browser env vars");
  return createClient(url, key);
}
