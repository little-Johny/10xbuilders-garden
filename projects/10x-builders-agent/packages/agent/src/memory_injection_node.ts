import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import {
  bumpRetrievalCount,
  matchMemories,
  type DbClient,
  type MatchedMemory,
} from "@agents/db";
import { generateEmbedding } from "./embeddings";
import type { GraphStateType } from "./state";

const MEMORY_TYPE_LABEL: Record<string, string> = {
  episodic: "episódico",
  semantic: "preferencia",
  procedural: "rutina",
};

function retrievalK(): number {
  const raw = Number(process.env.MEMORY_RETRIEVAL_K);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 6;
}

function contentToString(content: BaseMessage["content"]): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

/** Último mensaje del usuario en el estado (el input del turno actual). */
export function lastUserInput(messages: BaseMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m instanceof HumanMessage) {
      const text = contentToString(m.content).trim();
      if (text) return text;
    }
  }
  return null;
}

/** El SystemMessage líder (el que `runAgent` construyó desde el systemPrompt). */
function leadingSystemMessage(
  messages: BaseMessage[],
): (SystemMessage & { id: string }) | null {
  const sys = messages.find((m) => m instanceof SystemMessage) as
    | SystemMessage
    | undefined;
  if (sys?.id) return sys as SystemMessage & { id: string };
  return null;
}

export function buildMemoryBlock(memories: MatchedMemory[]): string {
  const lines = memories.map((m) => {
    const label = MEMORY_TYPE_LABEL[m.type] ?? m.type;
    return `- (${label}) ${m.content}`;
  });
  return [
    "[MEMORIA DEL USUARIO]",
    "Lo que recuerdas de sesiones anteriores con este usuario (úsalo solo cuando sea pertinente; no lo menciones de forma forzada):",
    ...lines,
    "[/MEMORIA DEL USUARIO]",
  ].join("\n");
}

/**
 * Crea el nodo `memory_injection`, primer nodo del grafo. Recupera por similitud
 * los recuerdos relevantes al input actual del usuario y los inyecta en el
 * SystemMessage líder como bloque `[MEMORIA DEL USUARIO]`. Cierra sobre `db` para
 * no meter el cliente (no serializable) en el GraphState.
 *
 * Degradación elegante: cualquier fallo (sin input, embeddings caídos, sin
 * recuerdos) hace passthrough (`return {}`) — el turno corre sin memoria, nunca
 * tumba el chat.
 */
export function makeMemoryInjectionNode(db: DbClient) {
  return async function memoryInjectionNode(
    state: GraphStateType,
  ): Promise<Partial<GraphStateType>> {
    const userInput = lastUserInput(state.messages);
    if (!userInput) return {};

    const sys = leadingSystemMessage(state.messages);
    if (!sys) return {};

    try {
      const embedding = await generateEmbedding(userInput);
      const memories = await matchMemories(db, state.userId, embedding, retrievalK());
      if (memories.length === 0) return {};

      await bumpRetrievalCount(
        db,
        memories.map((m) => m.id),
      ).catch((err) => {
        // El refuerzo del contador no debe bloquear la inyección.
        console.warn("[memoryInjectionNode] bumpRetrievalCount failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      const block = buildMemoryBlock(memories);
      const enriched = `${contentToString(sys.content)}\n\n${block}`;

      console.log("[memoryInjectionNode] injected memories", {
        userId: state.userId,
        retrieved: memories.length,
      });

      return {
        // Mismo id → messagesStateReducer reemplaza el SystemMessage existente.
        messages: [new SystemMessage({ id: sys.id, content: enriched })],
        systemPrompt: enriched,
      };
    } catch (err) {
      console.warn("[memoryInjectionNode] skipped (degraded)", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {};
    }
  };
}
