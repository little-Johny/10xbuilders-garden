"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Título opcional; si se pasa, se usa como aria-labelledby. */
  title?: ReactNode;
  /** Contenido dinámico del modal. */
  children: ReactNode;
  /** Zona de acciones (botones). Se renderiza alineada a la derecha. */
  footer?: ReactNode;
  /** Cerrar al hacer click en el backdrop (default true). */
  closeOnBackdrop?: boolean;
  /** Cerrar con la tecla Escape (default true). */
  closeOnEsc?: boolean;
};

/**
 * Modal genérico y reutilizable. Renderiza vía portal en <body> (para no quedar
 * recortado por overflow/stacking), bloquea el scroll del fondo, cierra con Esc
 * y con click en el backdrop, y enfoca el panel al abrir. El contenido es
 * dinámico (`children` + `footer`), pensado para reutilizarse en otros flujos.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeOnBackdrop = true,
  closeOnEsc = true,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    // Bloquea el scroll del fondo mientras el modal está abierto.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (closeOnEsc && e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    // Enfoca el panel al abrir (accesibilidad).
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeOnEsc, onClose]);

  // El modal arranca cerrado, así que servidor y cliente renderizan null en el
  // primer paint (sin mismatch de hidratación); el portal solo se activa tras
  // una interacción del usuario, ya en cliente.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // Solo cierra si el click fue en el backdrop, no dentro del panel.
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="relative z-10 w-full max-w-md rounded-lg border border-neutral-200 bg-white p-5 shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-900"
      >
        {title && (
          <h2
            id={titleId}
            className="text-base font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {title}
          </h2>
        )}

        <div className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
          {children}
        </div>

        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
