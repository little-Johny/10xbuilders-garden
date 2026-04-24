import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServerClient, upsertIntegration } from "@agents/db";
import {
  GITHUB_OAUTH_SCOPES,
  GITHUB_OAUTH_STATE_COOKIE,
  GITHUB_PROVIDER,
  exchangeCodeForToken,
  fetchAuthenticatedUser,
} from "@/lib/github/oauth";

function settingsRedirect(baseUrl: URL, status: "ok" | "error", reason?: string) {
  const target = new URL("/settings", baseUrl);
  target.searchParams.set("github", status);
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

  const cookieState = request.cookies.get(GITHUB_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return settingsRedirect(url, "error", "invalid_state");
  }

  try {
    const tokenResp = await exchangeCodeForToken(code);
    const ghUser = await fetchAuthenticatedUser(tokenResp.access_token);
    const db = createServerClient();
    await upsertIntegration(db, {
      userId: user.id,
      provider: GITHUB_PROVIDER,
      scopes: tokenResp.scope ? tokenResp.scope.split(/[,\s]+/).filter(Boolean) : GITHUB_OAUTH_SCOPES,
      accessToken: tokenResp.access_token,
      providerAccountId: String(ghUser.id),
      providerAccountLogin: ghUser.login,
    });

    const res = settingsRedirect(url, "ok");
    res.cookies.set(GITHUB_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    console.error("GitHub OAuth callback failed:", e);
    return settingsRedirect(url, "error", "exchange_failed");
  }
}
