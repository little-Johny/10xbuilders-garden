import type { DbClient } from "@agents/db";
import type { NotificationChannelAdapter, NotificationPayload } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

/**
 * Envía un mensaje de texto al chat indicado. Logueamos pero no lanzamos en
 * fallos: el agente ya completó su trabajo y no queremos abortar todo el flujo
 * porque Telegram esté caído.
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  const token = getBotToken();
  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN no configurado; mensaje omitido.");
    return;
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[telegram] sendMessage failed:", res.status, body);
    }
  } catch (err) {
    console.error("[telegram] sendMessage threw:", err);
  }
}

/**
 * Inline keyboard "Aprobar / Cancelar" usado tanto por el chat HITL como por
 * el dispatcher de tareas programadas cuando el grafo se interrumpe.
 */
export function confirmationKeyboard(toolCallId: string) {
  return {
    inline_keyboard: [
      [
        { text: "Aprobar", callback_data: `approve:${toolCallId}` },
        { text: "Cancelar", callback_data: `reject:${toolCallId}` },
      ],
    ],
  };
}

function renderPayload(payload: NotificationPayload): {
  text: string;
  replyMarkup?: Record<string, unknown>;
} {
  switch (payload.kind) {
    case "scheduled_started":
      return { text: `▶️ Ejecutando tarea programada: ${payload.taskName}` };
    case "scheduled_completed":
      return {
        text: `✅ Tarea «${payload.taskName}» completada.\n\n${payload.reply}`,
      };
    case "scheduled_failed":
      return {
        text: `❌ Tarea «${payload.taskName}» falló: ${payload.error}`,
      };
    case "pending_confirmation": {
      const prefix = payload.taskName
        ? `🔔 Tarea programada «${payload.taskName}» requiere tu aprobación:\n\n`
        : "🔔 Se requiere tu aprobación:\n\n";
      return {
        text: `${prefix}${payload.summary}`,
        replyMarkup: confirmationKeyboard(payload.toolCallId),
      };
    }
  }
}

export const telegramAdapter: NotificationChannelAdapter = {
  id: "telegram",
  async send(userId, db, payload) {
    const { data: account } = await db
      .from("telegram_accounts")
      .select("chat_id")
      .eq("user_id", userId)
      .maybeSingle();
    const chatId = (account as { chat_id?: number } | null)?.chat_id;
    if (!chatId) {
      console.warn("[telegram] usuario sin cuenta vinculada:", userId);
      return;
    }
    const { text, replyMarkup } = renderPayload(payload);
    await sendTelegramMessage(chatId, text, replyMarkup);
  },
};
