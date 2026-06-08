"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

/**
 * Cierra la sesión web activa (dispara el memory_flush del lado del servidor) y
 * recarga /chat. Al no haber sesión activa, `page.tsx` renderiza el chat vacío.
 *
 * Usamos una recarga completa (`window.location.assign`) en lugar de
 * `router.refresh()` porque este Next está modificado y el refresh blando no
 * remonta el componente de chat de forma fiable (el estado del historial vive en
 * un `useState` que solo se inicializa al montar). La recarga garantiza un
 * montaje limpio. No borra mensajes: la conversación previa queda `closed` en BD.
 *
 * La confirmación usa un `ConfirmDialog` (modal propio) en vez del `confirm()`
 * del navegador. El overlay de página completa se mantiene desde que confirmas
 * hasta que la navegación descarta la página, así no parpadea.
 */
export function NewConversationButton() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      await fetch("/api/sessions/close", { method: "POST" });
      // Recarga completa → montaje limpio del chat, sin historial previo.
      window.location.assign("/chat");
      // No limpiamos `submitting`: la página se descarta con la navegación.
    } catch {
      // Si el cierre falló, restauramos el botón (el sweep cerrará la sesión luego).
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={submitting}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        {submitting ? "Guardando…" : "Nueva conversación"}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Iniciar una conversación nueva"
        confirmLabel="Iniciar nueva"
        cancelLabel="Cancelar"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      >
        Se cerrará la conversación actual y el agente guardará lo aprendido de ella
        en su memoria. El historial dejará de mostrarse, pero no se borra.
      </ConfirmDialog>

      {submitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-sm dark:bg-neutral-950/70">
          <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-5 py-4 text-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-600 dark:border-neutral-700 dark:border-t-blue-400" />
            Guardando memoria e iniciando una conversación nueva…
          </div>
        </div>
      )}
    </>
  );
}
