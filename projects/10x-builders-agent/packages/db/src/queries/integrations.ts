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
 *
 * For providers with refresh tokens (e.g. Google), pass `refreshToken` and
 * `accessTokenExpiresAt`; both are persisted alongside the access token so
 * the runtime can refresh transparently before each call.
 */
export async function upsertIntegration(
  db: DbClient,
  params: {
    userId: string;
    provider: string;
    scopes: string[];
    accessToken: string;
    refreshToken?: string;
    accessTokenExpiresAt?: Date;
    providerAccountId?: string;
    providerAccountLogin?: string;
  }
) {
  const encrypted = encryptSecret(params.accessToken);
  const encryptedRefresh = params.refreshToken
    ? encryptSecret(params.refreshToken)
    : null;
  const { data, error } = await db
    .from("user_integrations")
    .upsert(
      {
        user_id: params.userId,
        provider: params.provider,
        scopes: params.scopes,
        encrypted_tokens: encrypted,
        encrypted_refresh_token: encryptedRefresh,
        access_token_expires_at: params.accessTokenExpiresAt
          ? params.accessTokenExpiresAt.toISOString()
          : null,
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
 * Updates only the access token + its expiry for a refresh-token provider.
 * Used by the refresh flow: leaves scopes, refresh token and account metadata
 * untouched.
 */
export async function updateAccessToken(
  db: DbClient,
  params: {
    userId: string;
    provider: string;
    accessToken: string;
    accessTokenExpiresAt: Date;
  }
) {
  const encrypted = encryptSecret(params.accessToken);
  const { error } = await db
    .from("user_integrations")
    .update({
      encrypted_tokens: encrypted,
      access_token_expires_at: params.accessTokenExpiresAt.toISOString(),
    })
    .eq("user_id", params.userId)
    .eq("provider", params.provider);
  if (error) throw error;
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

/**
 * Decrypts the refresh token for a provider that uses one (e.g. Google).
 * Returns `null` if the integration is inactive or no refresh token was stored.
 */
export async function getDecryptedRefreshToken(
  db: DbClient,
  userId: string,
  provider: string
): Promise<string | null> {
  const row = await getUserIntegration(db, userId, provider);
  if (!row || row.status !== "active") return null;
  const encrypted = (row as unknown as { encrypted_refresh_token?: string | null })
    .encrypted_refresh_token;
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
