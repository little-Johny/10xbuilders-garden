import {
  type DbClient,
  getUserIntegration,
  getDecryptedAccessToken,
  getDecryptedRefreshToken,
  revokeIntegration,
  updateAccessToken,
} from "@agents/db";
import { GOOGLE_PROVIDER, refreshAccessToken } from "./oauth";

// Refresh a bit before the actual expiry to avoid races where the token is
// still technically valid when we check but expires mid-flight.
const REFRESH_LEEWAY_MS = 60_000;

/**
 * Returns a valid Google access token for the user, refreshing it transparently
 * if it has expired (or will expire within `REFRESH_LEEWAY_MS`). Returns null
 * if the user has no active Google integration, or if the refresh token has
 * become invalid (in which case the integration is marked as revoked so the
 * UI can prompt the user to reconnect).
 */
export async function ensureFreshGoogleAccessToken(
  db: DbClient,
  userId: string
): Promise<{ accessToken: string; expiresAt: Date | null } | null> {
  const row = await getUserIntegration(db, userId, GOOGLE_PROVIDER);
  if (!row || row.status !== "active") return null;

  const expiresAt = row.access_token_expires_at
    ? new Date(row.access_token_expires_at)
    : null;
  const stillFresh = expiresAt && expiresAt.getTime() - Date.now() > REFRESH_LEEWAY_MS;

  if (stillFresh) {
    const accessToken = await getDecryptedAccessToken(db, userId, GOOGLE_PROVIDER);
    if (!accessToken) return null;
    return { accessToken, expiresAt };
  }

  // Need to refresh.
  const refreshToken = await getDecryptedRefreshToken(db, userId, GOOGLE_PROVIDER);
  if (!refreshToken) {
    await revokeIntegration(db, userId, GOOGLE_PROVIDER);
    return null;
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await updateAccessToken(db, {
      userId,
      provider: GOOGLE_PROVIDER,
      accessToken: refreshed.access_token,
      accessTokenExpiresAt: newExpiresAt,
    });
    return { accessToken: refreshed.access_token, expiresAt: newExpiresAt };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // `invalid_grant` means the refresh token is no longer accepted (revoked
    // by the user, scopes changed, etc). Mark as revoked; the user will see
    // the integration as disconnected in Settings on next load.
    if (msg.includes("invalid_grant")) {
      await revokeIntegration(db, userId, GOOGLE_PROVIDER);
      return null;
    }
    // Other errors (network, 5xx) bubble up so the caller can surface them.
    throw e;
  }
}
