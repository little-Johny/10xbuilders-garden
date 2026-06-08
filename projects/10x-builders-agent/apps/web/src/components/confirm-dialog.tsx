"use client";

import type { ReactNode } from "react";
import { Modal } from "./modal";

type Props = {
  open: boolean;
  title: ReactNode;
  /** Cuerpo del diálogo: texto o cualquier contenido dinámico. */
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo del botón de confirmar. `danger` para acciones destructivas. */
  variant?: "default" | "danger";
  /** Mientras true, deshabilita los botones y muestra texto de carga. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Diálogo de confirmación reutilizable, construido sobre `Modal`. Sustituye al
 * `window.confirm()` del navegador con un modal estilizado y con contenido
 * dinámico (`children`). Ejemplo de uso en `chat/new-conversation-button.tsx`.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmClasses =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-blue-600 hover:bg-blue-700";

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onCancel}
      title={title}
      closeOnBackdrop={!loading}
      closeOnEsc={!loading}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${confirmClasses}`}
          >
            {loading ? "Procesando…" : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
