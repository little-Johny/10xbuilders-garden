import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServerClient, deleteIntegration } from "@agents/db";
import { GOOGLE_PROVIDER } from "@/lib/google/oauth";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  try {
    await deleteIntegration(db, user.id, GOOGLE_PROVIDER);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Google disconnect failed:", e);
    return NextResponse.json({ error: "disconnect_failed" }, { status: 500 });
  }
}
