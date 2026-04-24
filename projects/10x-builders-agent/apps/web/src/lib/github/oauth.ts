import { randomBytes } from "node:crypto";

export const GITHUB_PROVIDER = "github";
export const GITHUB_OAUTH_STATE_COOKIE = "gh_oauth_state";
export const GITHUB_OAUTH_SCOPES = ["repo", "read:user"];

export function getGithubOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GitHub OAuth env vars: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET"
    );
  }
  const redirectUri = `${appUrl.replace(/\/+$/, "")}/api/auth/github/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = getGithubOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GITHUB_OAUTH_SCOPES.join(" "),
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function generateState() {
  return randomBytes(24).toString("base64url");
}

export interface GithubTokenResponse {
  access_token: string;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForToken(code: string): Promise<GithubTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGithubOAuthConfig();
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as GithubTokenResponse;
  if (body.error || !body.access_token) {
    throw new Error(
      `GitHub token exchange error: ${body.error ?? "no access_token"} (${body.error_description ?? ""})`
    );
  }
  return body;
}

export interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

export async function fetchAuthenticatedUser(accessToken: string): Promise<GithubUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "10x-builders-agent",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub /user failed: HTTP ${res.status}`);
  }
  return (await res.json()) as GithubUser;
}
