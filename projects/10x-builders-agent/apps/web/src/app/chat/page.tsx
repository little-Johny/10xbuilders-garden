import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatInterface } from "./chat-interface";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_completed) redirect("/onboarding");

  const { data: messages } = await supabase
    .from("agent_sessions")
    .select("id")
    .eq("user_id", user.id)
    .eq("channel", "web")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let sessionMessages: Array<{ role: string; content: string; created_at: string }> = [];
  if (messages?.id) {
    const { data } = await supabase
      .from("agent_messages")
      .select("role, content, created_at")
      .eq("session_id", messages.id)
      .order("created_at", { ascending: true })
      .limit(50);
    sessionMessages = data ?? [];
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
            {(profile.agent_name as string)?.[0]?.toUpperCase() ?? "A"}
          </div>
          <div>
            <h1 className="text-sm font-semibold">{profile.agent_name as string}</h1>
            <p className="text-xs text-neutral-500">Chat web</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href="/settings"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Ajustes
          </a>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Salir
            </button>
          </form>
        </div>
      </header>
      <ChatInterface
        agentName={profile.agent_name as string}
        initialMessages={sessionMessages}
      />
    </div>
  );
}
