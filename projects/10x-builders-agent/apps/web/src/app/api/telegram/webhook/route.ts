import { NextResponse } from "next/server";
import { createServerClient, getPendingToolCall } from "@agents/db";
import { AlreadyResolvedError, runAgent } from "@agents/agent";
import { loadIntegrationsContext } from "@/lib/agent/integrations-context";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string };
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message: { chat: { id: number }; message_id: number };
    data: string;
  };
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Telegram sendMessage failed:", res.status, body);
  }
}

function confirmationKeyboard(toolCallId: string) {
  return {
    inline_keyboard: [
      [
        { text: "Aprobar", callback_data: `approve:${toolCallId}` },
        { text: "Cancelar", callback_data: `reject:${toolCallId}` },
      ],
    ],
  };
}

/** Telegram sends "/cmd@BotName args" when the user picks a command from the menu. */
function parseBotCommand(messageText: string): { command: string; args: string } {
  const trimmed = messageText.trim();
  const i = trimmed.indexOf(" ");
  const head = i === -1 ? trimmed : trimmed.slice(0, i);
  const tail = i === -1 ? "" : trimmed.slice(i + 1).trim();
  const at = head.indexOf("@");
  const command = (at === -1 ? head : head.slice(0, at)).toLowerCase();
  return { command, args: tail };
}

async function answerCallbackQuery(callbackQueryId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update: TelegramUpdate = await request.json();
  const db = createServerClient();

  // Handle callback queries (confirmation buttons)
  if (update.callback_query) {
    const cb = update.callback_query;
    const [action, toolCallId] = cb.data.split(":");

    if (!toolCallId || (action !== "approve" && action !== "reject")) {
      await answerCallbackQuery(cb.id, "Acción no reconocida.");
      return NextResponse.json({ ok: true });
    }

    // Resolve user from telegram id and confirm the tool call belongs to them.
    const { data: telegramAccount } = await db
      .from("telegram_accounts")
      .select("*")
      .eq("telegram_user_id", cb.from.id)
      .single();
    if (!telegramAccount) {
      await answerCallbackQuery(cb.id, "Cuenta no vinculada.");
      return NextResponse.json({ ok: true });
    }
    const userId = telegramAccount.user_id as string;

    const pending = await getPendingToolCall(db, toolCallId);
    if (!pending) {
      await answerCallbackQuery(cb.id, "Esta acción ya fue resuelta o expiró.");
      return NextResponse.json({ ok: true });
    }

    // Ownership check against the session.
    const { data: session } = await db
      .from("agent_sessions")
      .select("user_id")
      .eq("id", pending.session_id)
      .single();
    if (!session || session.user_id !== userId) {
      await answerCallbackQuery(cb.id, "No autorizado.");
      return NextResponse.json({ ok: true });
    }

    // Resolve the graph by resuming the interrupted thread. This is the
    // single execution path: rejection routes through the same node and
    // produces a coherent ToolMessage that the model can reason about.
    const integrationsContext = await loadIntegrationsContext(db, userId);
    const { data: profile } = await db
      .from("profiles")
      .select("agent_system_prompt")
      .eq("id", userId)
      .single();
    const { data: toolSettings } = await db
      .from("user_tool_settings")
      .select("*")
      .eq("user_id", userId);
    const { data: integrations } = await db
      .from("user_integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active");

    if (!pending.thread_id) {
      await answerCallbackQuery(cb.id, "Esta acción ya no se puede reanudar.");
      return NextResponse.json({ ok: true });
    }

    try {
      const result = await runAgent({
        resumeDecision: action === "approve" ? "approve" : "reject",
        threadId: pending.thread_id,
        userId,
        sessionId: pending.session_id,
        systemPrompt:
          (profile?.agent_system_prompt as string) ?? "Eres un asistente útil.",
        db,
        enabledTools: (toolSettings ?? []).map((t: Record<string, unknown>) => ({
          id: t.id as string,
          user_id: t.user_id as string,
          tool_id: t.tool_id as string,
          enabled: t.enabled as boolean,
          config_json: (t.config_json as Record<string, unknown>) ?? {},
        })),
        integrations: (integrations ?? []).map((i: Record<string, unknown>) => ({
          id: i.id as string,
          user_id: i.user_id as string,
          provider: i.provider as string,
          scopes: (i.scopes as string[]) ?? [],
          status: i.status as "active" | "revoked" | "expired",
          created_at: i.created_at as string,
        })),
        integrationsContext,
      });

      await answerCallbackQuery(cb.id, action === "approve" ? "Aprobado" : "Rechazado");
      if (result.response) {
        await sendTelegramMessage(cb.message.chat.id, result.response);
      }
    } catch (err) {
      if (err instanceof AlreadyResolvedError) {
        await answerCallbackQuery(cb.id, "Esta acción ya fue resuelta.");
      } else {
        console.error("Telegram resume error:", err);
        await answerCallbackQuery(cb.id, "Falló la ejecución");
        await sendTelegramMessage(
          cb.message.chat.id,
          "No se pudo procesar la acción. Intenta de nuevo.",
        );
      }
    }

    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text) {
    return NextResponse.json({ ok: true });
  }

  const telegramUserId = message.from.id;
  const chatId = message.chat.id;
  const text = message.text.trim();
  const { command, args } = parseBotCommand(text);

  if (command === "/start") {
    await sendTelegramMessage(
      chatId,
      "¡Hola! Soy tu agente personal.\n\nSi ya tienes cuenta web, ve a Ajustes → Telegram en la web, genera un código de vinculación y envíamelo así:\n/link TU_CODIGO"
    );
    return NextResponse.json({ ok: true });
  }

  if (command === "/link") {
    const code = args.trim().toUpperCase();
    if (!code) {
      await sendTelegramMessage(
        chatId,
        "Indica el código que generaste en la web, por ejemplo:\n/link ABC123"
      );
      return NextResponse.json({ ok: true });
    }

    const { data: linkRecord } = await db
      .from("telegram_link_codes")
      .select("*")
      .eq("code", code)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!linkRecord) {
      await sendTelegramMessage(chatId, "Código inválido o expirado. Genera uno nuevo desde la web.");
      return NextResponse.json({ ok: true });
    }

    await db.from("telegram_accounts").upsert(
      {
        user_id: linkRecord.user_id,
        telegram_user_id: telegramUserId,
        chat_id: chatId,
        linked_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    await db.from("telegram_link_codes").update({ used: true }).eq("id", linkRecord.id);

    await sendTelegramMessage(chatId, "¡Cuenta vinculada correctamente! Ya puedes chatear conmigo.");
    return NextResponse.json({ ok: true });
  }

  const { data: telegramAccount } = await db
    .from("telegram_accounts")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .single();

  if (!telegramAccount) {
    await sendTelegramMessage(
      chatId,
      "No tienes una cuenta vinculada. Usa /link TU_CODIGO (código desde Ajustes en la web)."
    );
    return NextResponse.json({ ok: true });
  }

  const userId = telegramAccount.user_id;

  let session = await db
    .from("agent_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", "telegram")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()
    .then((r) => r.data);

  if (!session) {
    const { data } = await db
      .from("agent_sessions")
      .insert({
        user_id: userId,
        channel: "telegram",
        status: "active",
        budget_tokens_used: 0,
        budget_tokens_limit: 100000,
      })
      .select()
      .single();
    session = data;
  }

  if (!session) {
    await sendTelegramMessage(chatId, "Error interno creando sesión.");
    return NextResponse.json({ ok: true });
  }

  const { data: profile } = await db
    .from("profiles")
    .select("agent_system_prompt")
    .eq("id", userId)
    .single();

  const { data: toolSettings } = await db
    .from("user_tool_settings")
    .select("*")
    .eq("user_id", userId);

  const { data: integrations } = await db
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");

  try {
    const integrationsContext = await loadIntegrationsContext(db, userId);

    const result = await runAgent({
      message: text,
      userId,
      sessionId: session.id,
      systemPrompt: profile?.agent_system_prompt ?? "Eres un asistente útil.",
      db,
      enabledTools: (toolSettings ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        user_id: t.user_id as string,
        tool_id: t.tool_id as string,
        enabled: t.enabled as boolean,
        config_json: (t.config_json as Record<string, unknown>) ?? {},
      })),
      integrations: (integrations ?? []).map((i: Record<string, unknown>) => ({
        id: i.id as string,
        user_id: i.user_id as string,
        provider: i.provider as string,
        scopes: (i.scopes as string[]) ?? [],
        status: i.status as "active" | "revoked" | "expired",
        created_at: i.created_at as string,
      })),
      integrationsContext,
    });

    if (result.pendingConfirmation) {
      await sendTelegramMessage(
        chatId,
        `Se requiere tu aprobación: ${result.pendingConfirmation.summary}`,
        confirmationKeyboard(result.pendingConfirmation.toolCallId)
      );
    } else if (result.response) {
      await sendTelegramMessage(chatId, result.response);
    }
  } catch (error) {
    console.error("Telegram agent error:", error);
    await sendTelegramMessage(chatId, "Hubo un error procesando tu mensaje. Intenta de nuevo.");
  }

  return NextResponse.json({ ok: true });
}
