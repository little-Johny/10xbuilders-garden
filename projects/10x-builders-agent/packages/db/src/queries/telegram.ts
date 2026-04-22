import type { DbClient } from "../client";
import type { TelegramAccount } from "@agents/types";

export async function linkTelegramAccount(
  db: DbClient,
  userId: string,
  telegramUserId: number,
  chatId: number
) {
  const { data, error } = await db
    .from("telegram_accounts")
    .upsert(
      {
        user_id: userId,
        telegram_user_id: telegramUserId,
        chat_id: chatId,
        linked_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as TelegramAccount;
}

export async function getUserByTelegramId(
  db: DbClient,
  telegramUserId: number
) {
  const { data } = await db
    .from("telegram_accounts")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .single();
  return data as TelegramAccount | null;
}
