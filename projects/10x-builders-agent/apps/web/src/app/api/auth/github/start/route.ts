import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  GITHUB_OAUTH_STATE_COOKIE,
  buildAuthorizeUrl,
  generateState,
} from "@/lib/github/oauth";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  const state = generateState();
  const authorizeUrl = buildAuthorizeUrl(state);
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(GITHUB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
