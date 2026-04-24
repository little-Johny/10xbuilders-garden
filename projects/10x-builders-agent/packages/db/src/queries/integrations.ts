import type { DbClient } from "../client";
import type { UserIntegration } from "@agents/types";
import { decryptSecret, encryptSecret } from "../crypto";

export async function getUserIntegrations(db: DbClient, userId: string) {
  const { data, error } = await db
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as UserIntegration[];
}

export async function getUserIntegration(
  db: DbClient,
  userId: string,
  provider: string
) {
  const { data, error } = await db
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as UserIntegration | null;
}

/**
 * Persists (or overwrites) an OAuth integration for the user. The access token
 * is encrypted at rest with AES-256-GCM; the caller must pass the plaintext
 * and we never read back the ciphertext without the key.
 */
export async function upsertIntegration(
  db: DbClient,
  params: {
    userId: string;
    provider: string;
    scopes: string[];
    accessToken: string;
    providerAccountId?: string;
    providerAccountLogin?: string;
  }
) {
  const encrypted = encryptSecret(params.accessToken);
  const { data, error } = await db
    .from("user_integrations")
    .upsert(
      {
        user_id: params.userId,
        provider: params.provider,
        scopes: params.scopes,
        encrypted_tokens: encrypted,
        provider_account_id: params.providerAccountId ?? null,
        provider_account_login: params.providerAccountLogin ?? null,
        status: "active",
      },
      { onConflict: "user_id,provider" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as UserIntegration;
}

/**
 * Decrypts the access token for a provider. Returns `null` if the user has no
 * active integration. Throws if the ciphertext cannot be decrypted (e.g. the
 * encryption key was rotated): callers should treat that as "reconnect needed"
 * rather than leaking the error to the client.
 */
export async function getDecryptedAccessToken(
  db: DbClient,
  userId: string,
  provider: string
): Promise<string | null> {
  const row = await getUserIntegration(db, userId, provider);
  if (!row || row.status !== "active") return null;
  // `encrypted_tokens` is not part of the public UserIntegration type (it must
  // never leak to the client); read it through the raw row shape.
  const encrypted = (row as unknown as { encrypted_tokens?: string }).encrypted_tokens;
  if (!encrypted) return null;
  return decryptSecret(encrypted);
}

export async function deleteIntegration(
  db: DbClient,
  userId: string,
  provider: string
) {
  const { error } = await db
    .from("user_integrations")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw error;
}

export async function revokeIntegration(
  db: DbClient,
  userId: string,
  provider: string
) {
  const { error } = await db
    .from("user_integrations")
    .update({ status: "revoked" })
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw error;
}
