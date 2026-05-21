import {
  AIMessage,
  HumanMessage,
  RemoveMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { createCompactionModel } from "../model";
import type { GraphStateType } from "../state";

const CONTEXT_WINDOW = 64_000;
const COMPACTION_THRESHOLD = 0.8;
const TOOL_RESULTS_TO_PRESERVE = 5;
const TAIL_TURNS_TO_KEEP = TOOL_RESULTS_TO_PRESERVE + 2;
const MAX_CONSECUTIVE_FAILURES = 3;
const CLEARED_PLACEHOLDER = "[tool result cleared]";

function contentToString(content: BaseMessage["content"]): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function estimateTokens(messages: BaseMessage[]): number {
  const totalChars = messages.reduce(
    (sum, m) => sum + contentToString(m.content).length,
    0,
  );
  return Math.ceil(totalChars / 4);
}

export function stripAnalysisBlocks(text: string): string {
  return text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, "").trim();
}

function describeMessage(m: BaseMessage): string {
  const content = contentToString(m.content);
  if (m instanceof HumanMessage) return `[user]\n${content}`;
  if (m instanceof AIMessage) {
    const tcs = m.tool_calls?.length
      ? `\n(tool_calls: ${m.tool_calls.map((tc) => tc.name).join(", ")})`
      : "";
    return `[assistant]${tcs}\n${content}`;
  }
  if (m instanceof ToolMessage) return `[tool ${m.tool_call_id ?? ""}]\n${content}`;
  if (m instanceof SystemMessage) return `[system]\n${content}`;
  return `[message]\n${content}`;
}

const COMPACTION_SYSTEM_PROMPT = `Eres un compactador de historial de conversación de un agente.
Tu única tarea es leer el historial que se te entregue y devolver un resumen
estructurado con las 9 secciones listadas abajo, en español, sin añadir
introducciones ni cierres ni bloques <analysis>.

Reglas:
- Conserva datos concretos: ids, paths, fechas, nombres de herramientas, valores.
- No inventes información que no esté en el historial.
- Si una sección no tiene contenido, escribe "ninguno".
- Sé conciso: cada sección en viñetas cortas.

Secciones obligatorias (usa exactamente estos títulos en este orden):

1. Objetivo declarado del usuario
2. Decisiones tomadas
3. Datos extraídos de tool calls
4. Acciones ejecutadas exitosamente
5. Acciones rechazadas o fallidas
6. Estado actual de las integraciones
7. Preguntas pendientes del agente al usuario
8. Restricciones o preferencias declaradas
9. Próximo paso lógico`;

function buildUserPrompt(messages: BaseMessage[]): string {
  const transcript = messages.map(describeMessage).join("\n\n---\n\n");
  return `Historial a compactar:\n\n${transcript}`;
}

export async function compactionNode(
  state: GraphStateType,
): Promise<Partial<GraphStateType>> {
  if (state.compactionFailures >= MAX_CONSECUTIVE_FAILURES) {
    // Circuit breaker abierto: passthrough.
    return {};
  }

  const updates: BaseMessage[] = [];

  // ---- Etapa 1: microcompact (gratis) -------------------------------------
  const toolMessages = state.messages.filter(
    (m): m is ToolMessage => m instanceof ToolMessage,
  );
  const toClear = toolMessages.slice(
    0,
    Math.max(0, toolMessages.length - TOOL_RESULTS_TO_PRESERVE),
  );

  for (const tm of toClear) {
    if (!tm.id) continue; // sin id no podemos reemplazar vía reducer
    if (typeof tm.content === "string" && tm.content === CLEARED_PLACEHOLDER) {
      continue; // ya limpiado
    }
    updates.push(
      new ToolMessage({
        id: tm.id,
        content: CLEARED_PLACEHOLDER,
        tool_call_id: tm.tool_call_id,
      }),
    );
  }

  // Estado proyectado (con los microcompacts aplicados) para evaluar threshold.
  const replacementById = new Map<string, BaseMessage>();
  for (const u of updates) {
    if (u.id) replacementById.set(u.id, u);
  }
  const projected = state.messages.map((m) =>
    m.id && replacementById.has(m.id) ? replacementById.get(m.id)! : m,
  );

  const tokens = estimateTokens(projected);
  if (tokens < CONTEXT_WINDOW * COMPACTION_THRESHOLD) {
    return updates.length > 0
      ? { messages: updates, compactionFailures: 0 }
      : { compactionFailures: 0 };
  }

  // ---- Etapa 2: LLM compaction --------------------------------------------
  // Conserva SystemMessages iniciales + cola reciente. Resume el resto.
  const nonSystem = projected.filter((m) => !(m instanceof SystemMessage));
  const tailKeep = nonSystem.slice(-TAIL_TURNS_TO_KEEP);
  const head = nonSystem.slice(0, nonSystem.length - tailKeep.length);

  // Solo podemos eliminar mensajes que tienen id (requisito del reducer).
  const headWithId = head.filter((m): m is BaseMessage & { id: string } => !!m.id);

  if (headWithId.length === 0) {
    return updates.length > 0
      ? { messages: updates, compactionFailures: 0 }
      : { compactionFailures: 0 };
  }

  try {
    const model = createCompactionModel();
    const response = await model.invoke([
      new SystemMessage(COMPACTION_SYSTEM_PROMPT),
      new HumanMessage(buildUserPrompt(headWithId)),
    ]);
    const raw = contentToString(response.content);
    const cleaned = stripAnalysisBlocks(raw);

    if (!cleaned) {
      // Respuesta vacía tras strip: tratamos como fallo blando.
      return {
        messages: updates,
        compactionFailures: state.compactionFailures + 1,
      };
    }

    const removes = headWithId.map((m) => new RemoveMessage({ id: m.id }));
    const summaryMsg = new SystemMessage({
      content: `Resumen de contexto previo (compactado):\n\n${cleaned}`,
    });

    console.log("[compactionNode] LLM compaction applied", {
      removed: removes.length,
      tokensBefore: tokens,
      summaryChars: cleaned.length,
    });

    return {
      messages: [...updates, ...removes, summaryMsg],
      compactionFailures: 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[compactionNode] LLM compaction failed", {
      error: msg,
      consecutiveFailures: state.compactionFailures + 1,
    });
    return {
      messages: updates,
      compactionFailures: state.compactionFailures + 1,
    };
  }
}
