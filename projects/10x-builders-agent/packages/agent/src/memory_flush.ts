import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  findSimilarMemory,
  getSessionMessages,
  listMemories,
  saveMemory,
  bumpRetrievalCount,
  type DbClient,
} from "@agents/db";
import type { MemoryType } from "@agents/types";
import { createMemoryModel } from "./model";
import { generateEmbedding } from "./embeddings";

const VALID_TYPES: MemoryType[] = ["episodic", "semantic", "procedural"];

function minTurns(): number {
  const raw = Number(process.env.MEMORY_FLUSH_MIN_TURNS);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 2;
}

function dedupThreshold(): number {
  const raw = Number(process.env.MEMORY_DEDUP_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.9;
}

function contentToString(content: BaseMessage["content"]): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

const EXTRACTION_SYSTEM_PROMPT = `Eres un extractor de memoria a largo plazo de un agente.
Lee la conversación y extrae SOLO hechos que seguirán siendo verdad en la próxima sesión.

Clasifica cada hecho en uno de estos tipos:
- "episodic": qué hizo el usuario y cuándo (eventos fechados).
- "semantic": preferencias y conocimiento durable del usuario.
- "procedural": cómo prefiere el usuario que se hagan las cosas (rutinas, metodologías).

Reglas:
- NO extraigas trivialidades, conversación de relleno, ni datos efímeros.
- NO repitas ni reformules hechos que el usuario ya conoces (te los doy abajo).
- Si no hay nada durable que recordar, devuelve un array vacío: [].
- Cada "content" es una frase corta, autocontenida y en tercera persona.

Salida: SOLO un array JSON con esta forma, sin prosa ni explicaciones ni bloques de código:
[{ "type": "semantic", "content": "..." }]`;

export interface ExtractedFact {
  type: MemoryType;
  content: string;
}

/** Quita fences de markdown y recorta para dejar el JSON parseable. */
function extractJsonArray(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return "[]";
  return text.slice(start, end + 1);
}

export function parseFacts(raw: string): ExtractedFact[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArray(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const facts: ExtractedFact[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { type, content } = item as Record<string, unknown>;
    if (typeof content !== "string" || !content.trim()) continue;
    if (typeof type !== "string" || !VALID_TYPES.includes(type as MemoryType)) {
      continue;
    }
    facts.push({ type: type as MemoryType, content: content.trim() });
  }
  return facts;
}

/** Normaliza para comparar duplicados triviales dentro del lote del LLM. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Colapsa hechos casi idénticos (mismo type + texto normalizado) del propio LLM. */
export function dedupeBatch(facts: ExtractedFact[]): ExtractedFact[] {
  const seen = new Set<string>();
  const out: ExtractedFact[] = [];
  for (const f of facts) {
    const key = `${f.type}::${normalize(f.content)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * Extracción post-sesión. Lee el historial completo de una sesión cerrada,
 * destila hechos durables, deduplica (intra-lote y contra lo almacenado) y
 * guarda solo lo nuevo. Best-effort: nunca lanza hacia el caller del tick; los
 * fallos se loguean.
 */
export async function memoryFlush(input: {
  db: DbClient;
  userId: string;
  sessionId: string;
}): Promise<{ extracted: number }> {
  const { db, userId, sessionId } = input;

  try {
    const history = await getSessionMessages(db, sessionId, 500);

    // Guard de sesión trivial: nada que valga la pena flushear.
    const userTurns = history.filter((m) => m.role === "user").length;
    if (userTurns < minTurns()) {
      console.log("[memoryFlush] skipped trivial session", {
        sessionId,
        userTurns,
      });
      return { extracted: 0 };
    }

    // Transcript para el LLM (a partir de filas de la BD, no del GraphState).
    const transcript = history
      .map((m) => {
        const content = (m.content ?? "").trim();
        if (!content) return null;
        if (m.role === "user") return `[usuario] ${content}`;
        if (m.role === "assistant") return `[agente] ${content}`;
        return null;
      })
      .filter((line): line is string => line !== null)
      .join("\n");

    if (!transcript) return { extracted: 0 };

    const known = await listMemories(db, userId, 50).catch(() => []);
    const knownBlock =
      known.length > 0
        ? known.map((k) => `- (${k.type}) ${k.content}`).join("\n")
        : "(ninguno todavía)";

    const model = createMemoryModel();
    const response = await model.invoke([
      new SystemMessage(EXTRACTION_SYSTEM_PROMPT),
      new HumanMessage(
        `Hechos que el usuario ya conoces (NO los repitas):\n${knownBlock}\n\n` +
          `Conversación a analizar:\n${transcript}`,
      ),
    ]);

    const facts = dedupeBatch(parseFacts(contentToString(response.content)));
    if (facts.length === 0) {
      console.log("[memoryFlush] nothing durable extracted", { sessionId });
      return { extracted: 0 };
    }

    let inserted = 0;
    for (const fact of facts) {
      try {
        const embedding = await generateEmbedding(fact.content);
        const similar = await findSimilarMemory(
          db,
          userId,
          embedding,
          fact.type,
          dedupThreshold(),
        );
        if (similar) {
          // Duplicado: refuerza el existente en vez de insertar otro.
          await bumpRetrievalCount(db, [similar.id]).catch(() => {});
          continue;
        }
        await saveMemory(db, userId, {
          type: fact.type,
          content: fact.content,
          embedding,
        });
        inserted++;
      } catch (err) {
        // Un hecho que falla (embedding/insert) no debe abortar el resto.
        console.warn("[memoryFlush] failed to persist fact", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log("[memoryFlush] done", {
      sessionId,
      userId,
      candidates: facts.length,
      inserted,
    });
    return { extracted: inserted };
  } catch (err) {
    console.error("[memoryFlush] failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { extracted: 0 };
  }
}
