/**
 * Smoke test para compaction_node (memoria a corto plazo del agente).
 *
 * Ejercita lo determinístico sin invocar al LLM:
 *  - stripAnalysisBlocks: elimina bloques <analysis>...</analysis>.
 *  - Microcompact: ToolMessages viejos se reemplazan por [tool result cleared],
 *    los últimos 5 quedan íntegros, y es idempotente.
 *  - Threshold bajo: con poco contenido no se cruza el 80% → solo microcompact.
 *  - Circuit breaker: compactionFailures >= 3 → passthrough (return vacío).
 *
 * El smoke #2 del plan (LLM compaction real) NO se cubre aquí porque requiere
 * OPENROUTER_API_KEY válida y red; correrlo manualmente en /chat.
 *
 * Run: npx tsx packages/agent/scripts/smoke-compaction.ts
 *
 * Sale con código != 0 si algún assert falla.
 */
import { randomUUID } from "node:crypto";
import {
  AIMessage,
  HumanMessage,
  RemoveMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";

import { compactionNode, stripAnalysisBlocks } from "../src/nodes/compaction_node";
import type { GraphStateType } from "../src/state";

let failed = 0;

function expect(condition: unknown, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function makeState(partial: Partial<GraphStateType>): GraphStateType {
  return {
    messages: [],
    sessionId: "sess-smoke",
    userId: "user-smoke",
    systemPrompt: "system",
    compactionFailures: 0,
    ...partial,
  } as GraphStateType;
}

function makeToolMsg(content: string): ToolMessage {
  const id = randomUUID();
  return new ToolMessage({ id, content, tool_call_id: `tc-${id.slice(0, 6)}` });
}

async function main(): Promise<void> {
  // Limpia env vars que podrían influir en createCompactionModel si se invocara.
  delete process.env.OPENROUTER_COMPACTION_MODEL;

  // ---------- stripAnalysisBlocks ----------
  console.log("\n[stripAnalysisBlocks]");
  {
    const a = stripAnalysisBlocks("texto limpio");
    expect(a === "texto limpio", "sin bloques → devuelve igual (trim)");

    const b = stripAnalysisBlocks("<analysis>razono...</analysis>respuesta");
    expect(b === "respuesta", "elimina un bloque");

    const c = stripAnalysisBlocks(
      "antes\n<analysis>uno</analysis>medio<analysis>dos</analysis>fin",
    );
    expect(c === "antes\nmediofin", "elimina múltiples bloques");

    const d = stripAnalysisBlocks(
      "<ANALYSIS>case-insensitive</ANALYSIS>visible",
    );
    expect(d === "visible", "case-insensitive");

    const e = stripAnalysisBlocks(
      "<analysis>linea1\nlinea2\nlinea3</analysis>solo esto",
    );
    expect(e === "solo esto", "multilinea");

    const f = stripAnalysisBlocks("<analysis>todo</analysis>");
    expect(f === "", "solo bloque → string vacío (trim)");
  }

  // ---------- Microcompact: 7 tool messages → 2 limpiados ----------
  console.log("\n[microcompact: 7 ToolMessages → 2 limpiados, 5 íntegros]");
  {
    const sys = new SystemMessage({ id: randomUUID(), content: "system" });
    const user = new HumanMessage({ id: randomUUID(), content: "haz X" });
    const tools = Array.from({ length: 7 }, (_, i) =>
      makeToolMsg(`resultado del tool ${i}`),
    );
    const state = makeState({ messages: [sys, user, ...tools] });

    const out = await compactionNode(state);
    const msgs = (out.messages ?? []) as BaseMessage[];

    expect(msgs.length === 2, "emite 2 actualizaciones (los 2 más viejos)");
    expect(
      msgs.every(
        (m) => m instanceof ToolMessage && m.content === "[tool result cleared]",
      ),
      "todos los emitidos tienen content = '[tool result cleared]'",
    );
    const emittedIds = new Set(msgs.map((m) => m.id));
    expect(
      tools.slice(0, 2).every((t) => emittedIds.has(t.id!)),
      "los ids emitidos corresponden a los 2 ToolMessages más viejos",
    );
    expect(
      !tools.slice(2).some((t) => emittedIds.has(t.id!)),
      "los últimos 5 ToolMessages NO se tocan",
    );
    expect(out.compactionFailures === 0, "resetea compactionFailures a 0");
  }

  // ---------- Microcompact idempotente ----------
  console.log("\n[microcompact: idempotente cuando los viejos ya están cleared]");
  {
    const tools: ToolMessage[] = [];
    for (let i = 0; i < 7; i++) {
      if (i < 2) {
        const id = randomUUID();
        tools.push(
          new ToolMessage({
            id,
            content: "[tool result cleared]",
            tool_call_id: `tc-${id.slice(0, 6)}`,
          }),
        );
      } else {
        tools.push(makeToolMsg(`resultado del tool ${i}`));
      }
    }
    const state = makeState({ messages: tools });
    const out = await compactionNode(state);
    const msgs = (out.messages ?? []) as BaseMessage[];
    expect(msgs.length === 0, "no re-emite mensajes ya limpiados");
  }

  // ---------- Microcompact: ≤ 5 tool messages → no toca nada ----------
  console.log("\n[microcompact: ≤ 5 ToolMessages → no emite nada]");
  {
    const tools = Array.from({ length: 5 }, (_, i) => makeToolMsg(`r${i}`));
    const state = makeState({ messages: tools });
    const out = await compactionNode(state);
    expect(
      (out.messages ?? []).length === 0,
      "con exactamente 5 ToolMessages no se emite cleanup",
    );
  }

  // ---------- Circuit breaker ----------
  console.log("\n[circuit breaker: compactionFailures >= 3 → passthrough]");
  {
    const tools = Array.from({ length: 7 }, (_, i) => makeToolMsg(`r${i}`));
    const state = makeState({ messages: tools, compactionFailures: 3 });
    const out = await compactionNode(state);
    expect(
      Object.keys(out).length === 0,
      "devuelve {} (no toca state) cuando contador llegó a 3",
    );
  }

  // ---------- Threshold: contenido pequeño NO invoca LLM ----------
  console.log("\n[threshold: contenido pequeño → no llama LLM compaction]");
  {
    // Sin OPENROUTER_COMPACTION_MODEL, llamar al LLM lanzaría error: si el
    // nodo no invoca al LLM (threshold no cruzado), compactionFailures
    // debe quedar en 0 y no debe lanzarse.
    const tools = Array.from({ length: 7 }, (_, i) => makeToolMsg(`x${i}`));
    const state = makeState({ messages: tools });
    let threw = false;
    let out: Partial<GraphStateType> = {};
    try {
      out = await compactionNode(state);
    } catch {
      threw = true;
    }
    expect(!threw, "no lanza (LLM no invocado porque tokens < threshold)");
    expect(out.compactionFailures === 0, "compactionFailures sigue en 0");
  }

  // ---------- Threshold: contenido grande SÍ intenta LLM (y falla controladamente) ----------
  console.log(
    "\n[threshold: contenido grande + LLM ausente → falla controlada, +1 fallo]",
  );
  {
    // Construye ~60k chars => ~15k tokens, por debajo. Subimos a ~280k chars
    // para superar 64_000 * 0.8 = 51_200 tokens (≈ 204_800 chars).
    const bigPad = "x".repeat(50_000);
    const sys = new SystemMessage({ id: randomUUID(), content: "sys" });
    const ai = new AIMessage({ id: randomUUID(), content: bigPad });
    const human = new HumanMessage({ id: randomUUID(), content: bigPad });
    const ai2 = new AIMessage({ id: randomUUID(), content: bigPad });
    const human2 = new HumanMessage({ id: randomUUID(), content: bigPad });
    const ai3 = new AIMessage({ id: randomUUID(), content: bigPad });
    const human3 = new HumanMessage({ id: randomUUID(), content: bigPad });
    const tools = Array.from({ length: 7 }, (_, i) =>
      makeToolMsg(`tool ${i} payload pequeño`),
    );
    const state = makeState({
      messages: [sys, ai, human, ai2, human2, ai3, human3, ...tools],
    });

    // OPENROUTER_API_KEY puede estar set en el entorno; OPENROUTER_COMPACTION_MODEL
    // está borrado → createCompactionModel lanzará "Missing OPENROUTER_COMPACTION_MODEL"
    // que el try/catch del nodo captura y convierte en +1 fallo.
    const out = await compactionNode(state);
    expect(
      out.compactionFailures === 1,
      "incrementa compactionFailures a 1 tras fallo del LLM",
    );
    // Como había 7 tool messages, debe haber emitido microcompacts también.
    const removeCount = (out.messages ?? []).filter(
      (m) => m instanceof RemoveMessage,
    ).length;
    expect(
      removeCount === 0,
      "no emite RemoveMessage (head no se purga si la etapa 2 falló)",
    );
  }

  console.log(
    `\n${failed === 0 ? "✓ smoke-compaction: todos los asserts pasaron" : `✗ smoke-compaction: ${failed} asserts fallaron`}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("smoke-compaction CRASH:", err);
  process.exit(1);
});
