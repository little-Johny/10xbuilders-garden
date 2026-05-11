import type { DbClient } from "@agents/db";
import type { NotificationChannel } from "@agents/types";
import { telegramAdapter } from "./telegram";
import type { NotificationChannelAdapter, NotificationPayload } from "./types";

export type { NotificationPayload, NotificationChannelAdapter } from "./types";
export { sendTelegramMessage, confirmationKeyboard } from "./telegram";

const REGISTRY: Record<NotificationChannel, NotificationChannelAdapter> = {
  telegram: telegramAdapter,
};

/**
 * Despacha una notificación a todos los canales pedidos. Errores por canal se
 * loguean pero no abortan los demás — un fallo en email no debe impedir el
 * mensaje de Telegram.
 *
 * Canales desconocidos se ignoran con un warning para que añadir entries
 * tipográficamente válidos pero sin adapter (`['telegram','email']` antes de
 * que email exista) no rompa el endpoint del cron.
 */
export async function dispatchNotification(
  channels: readonly NotificationChannel[],
  userId: string,
  db: DbClient,
  payload: NotificationPayload,
): Promise<void> {
  await Promise.all(
    channels.map(async (id) => {
      const adapter = REGISTRY[id];
      if (!adapter) {
        console.warn("[notifications] canal sin adapter, se ignora:", id);
        return;
      }
      try {
        await adapter.send(userId, db, payload);
      } catch (err) {
        console.error(`[notifications] adapter ${id} falló:`, err);
      }
    }),
  );
}
