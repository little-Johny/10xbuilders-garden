import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Si el enlace de recuperación expiró o es inválido, llevar al usuario de
  // vuelta a forgot-password con un mensaje claro, no al login genérico.
  if (next === "/reset-password") {
    return NextResponse.redirect(`${origin}/forgot-password?error=expired`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
