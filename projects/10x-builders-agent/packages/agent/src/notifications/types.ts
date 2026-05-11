import type { DbClient } from "@agents/db";
import type { NotificationChannel } from "@agents/types";

export type NotificationPayload =
  | { kind: "scheduled_started"; taskName: string }
  | { kind: "scheduled_completed"; taskName: string; reply: string }
  | { kind: "scheduled_failed"; taskName: string; error: string }
  | {
      kind: "pending_confirmation";
      toolCallId: string;
      toolName: string;
      summary: string;
      taskName?: string;
    };

export interface NotificationChannelAdapter {
  id: NotificationChannel;
  /**
   * Envía la notificación al canal. El adapter resuelve internamente el
   * destino (chat_id, email, etc.) a partir del userId. Si el canal no
   * está configurado para ese usuario, debe loguear y retornar sin lanzar.
   */
  send(userId: string, db: DbClient, payload: NotificationPayload): Promise<void>;
}
