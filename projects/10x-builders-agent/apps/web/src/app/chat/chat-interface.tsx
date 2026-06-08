"use client";

import { useState, useRef, useEffect } from "react";

interface PendingConfirmation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
}

interface ChatItem {
  kind: "message" | "confirmation";
  role?: string;
  content?: string;
  pending?: PendingConfirmation;
  /** Marks a confirmation that has already been resolved so we don't let the user click again. */
  resolved?: boolean;
}

interface Message {
  role: string;
  content: string;
  created_at?: string;
  structured_payload?: Record<string, unknown> | null;
}

interface Props {
  agentName: string;
  initialMessages: Message[];
}

/**
 * Hydrate persisted messages into chat items. Messages whose
 * `structured_payload.type === "pending_confirmation"` become confirmation
 * cards (active or already-resolved); plain text messages render as text.
 * `agent_messages` is the single source of truth — we never query
 * `tool_calls` separately from the page.
 */
function hydrateInitialItems(messages: Message[]): ChatItem[] {
  const items: ChatItem[] = [];
  let cards = 0;
  for (const m of messages) {
    const payload = m.structured_payload as
      | {
          type?: string;
          tool_call_id?: string;
          tool_name?: string;
          args?: Record<string, unknown>;
          summary?: string;
          resolved?: boolean;
        }
      | null
      | undefined;
    if (payload?.type === "pending_confirmation" && payload.tool_call_id) {
      cards++;
      items.push({
        kind: "confirmation",
        pending: {
          toolCallId: payload.tool_call_id,
          toolName: payload.tool_name ?? "",
          args: payload.args ?? {},
          summary: payload.summary ?? "",
        },
        resolved: payload.resolved === true,
      });
      continue;
    }
    if (m.content) {
      items.push({ kind: "message", role: m.role, content: m.content });
    }
  }
  if (typeof window !== "undefined") {
    console.log("[chat-interface] hydrate", {
      messages: messages.length,
      items: items.length,
      cards,
      sample: messages.slice(0, 3).map((m) => ({
        role: m.role,
        hasPayload: m.structured_payload !== null,
        payloadType:
          (m.structured_payload as { type?: string } | null)?.type ?? null,
      })),
    });
  }
  return items;
}

export function ChatInterface({ agentName, initialMessages }: Props) {
  const [items, setItems] = useState<ChatItem[]>(() =>
    hydrateInitialItems(initialMessages),
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyConfirmId, setBusyConfirmId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Aborta la petición en vuelo cuando el usuario pulsa "Detener".
  const abortRef = useRef<AbortController | null>(null);
  // Texto del turno en vuelo: si se cancela, lo devolvemos al input para editar.
  const pendingTextRef = useRef<string>("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  // Auto-crecimiento del textarea según el contenido (con tope de altura).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function appendAssistantText(text: string) {
    setItems((prev) => [...prev, { kind: "message", role: "assistant", content: text }]);
  }

  function appendPending(p: PendingConfirmation) {
    setItems((prev) => [...prev, { kind: "confirmation", pending: p }]);
  }

  function markConfirmationResolved(toolCallId: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.kind === "confirmation" && it.pending?.toolCallId === toolCallId
          ? { ...it, resolved: true }
          : it
      )
    );
  }

  async function submitMessage() {
    const text = input.trim();
    if (!text || loading) return;

    pendingTextRef.current = text;
    setItems((prev) => [...prev, { kind: "message", role: "user", content: text }]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.response) appendAssistantText(data.response);
      if (data.pendingConfirmation) appendPending(data.pendingConfirmation);
    } catch (err) {
      // Cancelación del usuario: handleStop ya quitó la burbuja y restauró el
      // texto, así que no mostramos error.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        appendAssistantText("Error al procesar tu mensaje. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    void submitMessage();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía; Shift+Enter inserta un salto de línea (comportamiento nativo).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitMessage();
    }
  }

  /**
   * Cancela el turno en vuelo. Aborta el fetch, quita la burbuja optimista del
   * usuario y devuelve el texto al input para completarlo y reenviarlo. Nota: el
   * servidor ya arrancó y persistirá el mensaje igualmente (aparecerá al recargar).
   */
  function handleStop() {
    abortRef.current?.abort();
    setItems((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        const it = prev[i];
        if (it.kind === "message" && it.role === "user") {
          return prev.filter((_, idx) => idx !== i);
        }
      }
      return prev;
    });
    if (pendingTextRef.current) setInput(pendingTextRef.current);
  }

  async function handleConfirm(toolCallId: string, decision: "approve" | "reject") {
    if (busyConfirmId) return;
    setBusyConfirmId(toolCallId);
    try {
      const res = await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolCallId, decision }),
      });
      const data = await res.json();
      markConfirmationResolved(toolCallId);
      if (data.response) appendAssistantText(data.response);
      if (data.pendingConfirmation) appendPending(data.pendingConfirmation);
      if (!res.ok && data.detail) {
        appendAssistantText(`No se pudo ejecutar la acción: ${data.detail}`);
      }
    } catch {
      appendAssistantText("Error al registrar tu decisión. Intenta de nuevo.");
    } finally {
      setBusyConfirmId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {items.length === 0 && (
            <div className="text-center text-sm text-neutral-400 py-20">
              <p className="text-lg font-medium text-neutral-600 dark:text-neutral-300">
                ¡Hola! Soy {agentName}
              </p>
              <p className="mt-1">Escribe un mensaje para comenzar.</p>
            </div>
          )}
          {items.map((item, i) => {
            if (item.kind === "message") {
              const isUser = item.role === "user";
              return (
                <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                      isUser
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{item.content}</p>
                  </div>
                </div>
              );
            }
            const p = item.pending!;
            const busy = busyConfirmId === p.toolCallId;
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[90%] w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700 dark:bg-amber-900/20">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    Se requiere tu aprobación
                  </p>
                  <p className="mt-1 text-neutral-800 dark:text-neutral-100">{p.summary}</p>
                  <pre className="mt-2 overflow-x-auto rounded bg-white/70 p-2 text-xs font-mono text-neutral-700 dark:bg-black/30 dark:text-neutral-200">
                    {JSON.stringify(p.args, null, 2)}
                  </pre>
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={item.resolved || busy}
                      onClick={() => handleConfirm(p.toolCallId, "approve")}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {busy ? "Ejecutando..." : "Aprobar"}
                    </button>
                    <button
                      disabled={item.resolved || busy}
                      onClick={() => handleConfirm(p.toolCallId, "reject")}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      Cancelar
                    </button>
                  </div>
                  {item.resolved && (
                    <p className="mt-2 text-xs text-neutral-500">Decisión registrada.</p>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-neutral-100 px-4 py-2.5 text-sm dark:bg-neutral-800">
                <span className="animate-pulse">Pensando...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800 bg-black">
        <form onSubmit={handleSend} className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu mensaje...  (Shift+Enter para salto de línea)"
            disabled={loading}
            className="flex-1 resize-none overflow-y-auto rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
            >
              Detener
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Enviar
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
