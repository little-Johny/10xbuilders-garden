import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServerClient, upsertIntegration } from "@agents/db";
import {
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_PROVIDER,
  exchangeCodeForToken,
  fetchGoogleUserInfo,
} from "@/lib/google/oauth";

function settingsRedirect(baseUrl: URL, status: "ok" | "error", reason?: string) {
  const target = new URL("/settings", baseUrl);
  target.searchParams.set("google", status);
  if (reason) target.searchParams.set("reason", reason);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", url));
  }

  if (error) {
    return settingsRedirect(url, "error", error);
  }

  const cookieState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return settingsRedirect(url, "error", "invalid_state");
  }

  try {
    const tokenResp = await exchangeCodeForToken(code);
    // Without a refresh token we cannot refresh the access token later, so
    // refuse to persist a half-broken integration.
    if (!tokenResp.refresh_token) {
      return settingsRedirect(url, "error", "missing_refresh_token");
    }
    const userInfo = await fetchGoogleUserInfo(tokenResp.access_token);
    const expiresAt = new Date(Date.now() + tokenResp.expires_in * 1000);
    const grantedScopes = tokenResp.scope
      ? tokenResp.scope.split(/\s+/).filter(Boolean)
      : GOOGLE_OAUTH_SCOPES;

    const db = createServerClient();
    await upsertIntegration(db, {
      userId: user.id,
      provider: GOOGLE_PROVIDER,
      scopes: grantedScopes,
      accessToken: tokenResp.access_token,
      refreshToken: tokenResp.refresh_token,
      accessTokenExpiresAt: expiresAt,
      providerAccountId: userInfo.sub,
      providerAccountLogin: userInfo.email,
    });

    const res = settingsRedirect(url, "ok");
    res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    console.error("Google OAuth callback failed:", e);
    return settingsRedirect(url, "error", "exchange_failed");
  }
}
