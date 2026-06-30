import { randomBytes } from "node:crypto";

export const GOOGLE_PROVIDER = "google";
export const GOOGLE_OAUTH_STATE_COOKIE = "g_oauth_state";

// `openid` + `email` enable us to read the user's email at callback time and
// show "connected as <email>" in the Settings UI. All Google APIs share the
// same OAuth client and the same row in `user_integrations`; adding a new
// scope here invalidates existing grants — users must reconnect Google to
// authorize the new permission (Settings → Google → Disconnect → Connect).
export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/spreadsheets",
];

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing Google OAuth env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET"
    );
  }
  const redirectUri = `${appUrl.replace(/\/+$/, "")}/api/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
    // `access_type=offline` + `prompt=consent` together guarantee a refresh
    // token on every connect, even if the user has authorized this client
    // before. Without `prompt=consent` Google may omit the refresh token on
    // re-authorization, leaving us with an unrefreshable integration.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

export function generateState() {
  return randomBytes(24).toString("base64url");
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as GoogleTokenResponse;
  if (!data.access_token) {
    throw new Error("Google token exchange returned no access_token");
  }
  return data;
}

export interface GoogleRefreshResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

/**
 * Trades a refresh token for a fresh access token. Throws on `invalid_grant`
 * (revoked refresh token, scopes changed) so callers can mark the integration
 * as revoked.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleRefreshResponse> {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Surface `invalid_grant` verbatim so the refresh helper can detect it
    // and mark the integration as revoked.
    throw new Error(`Google token refresh failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as GoogleRefreshResponse;
  if (!data.access_token) {
    throw new Error("Google token refresh returned no access_token");
  }
  return data;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed: HTTP ${res.status}`);
  }
  return (await res.json()) as GoogleUserInfo;
}
