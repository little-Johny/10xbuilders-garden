/**
 * Smoke test para la memoria a largo plazo.
 *
 * Ejercita lo determinístico sin DB ni LLM:
 *  - parseFacts: parseo/validación del JSON que devuelve el extractor (fences de
 *    markdown, tipos inválidos, content vacío, no-array, basura → []).
 *  - dedupeBatch: colapsa hechos casi idénticos (mismo type + texto normalizado).
 *  - buildMemoryBlock: arma el bloque [MEMORIA DEL USUARIO] con las etiquetas.
 *  - lastUserInput: toma el último HumanMessage no vacío del estado.
 *
 * Sección EN VIVO (opcional): si OPENROUTER_API_KEY está presente, verifica que
 * generateEmbedding devuelve un vector de 1536 dims (no escribe en la BD). Es la
 * comprobación del eslabón más riesgoso (que OpenRouter sirva /embeddings).
 * Las pruebas contra Supabase (saveMemory/matchMemories/flush real) se hacen
 * manualmente desde /chat o con curl al endpoint, como documenta el README.
 *
 * Run: npx tsx packages/agent/scripts/smoke-memory.ts
 *
 * Sale con código != 0 si algún assert falla.
 */
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

import { parseFacts, dedupeBatch } from "../src/memory_flush";
import { buildMemoryBlock, lastUserInput } from "../src/memory_injection_node";
import { generateEmbedding } from "../src/embeddings";
import type { MatchedMemory } from "@agents/db";

let failed = 0;

function expect(condition: unknown, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function main(): Promise<void> {
  // ---------- parseFacts ----------
  console.log("\n[parseFacts]");
  {
    const ok = parseFacts(
      '[{"type":"semantic","content":"Prefiere TypeScript"},{"type":"procedural","content":"Pide diagrama primero"}]',
    );
    expect(ok.length === 2, "array válido → 2 hechos");
    expect(
      ok[0].type === "semantic" && ok[0].content === "Prefiere TypeScript",
      "preserva type y content",
    );

    const fenced = parseFacts(
      '```json\n[{"type":"episodic","content":"El martes desplegó la rama X"}]\n```',
    );
    expect(fenced.length === 1, "tolera fences de markdown (```json)");

    const prose = parseFacts(
      'Claro, aquí tienes:\n[{"type":"semantic","content":"Usa Supabase"}]\nEso es todo.',
    );
    expect(prose.length === 1, "extrae el array aunque venga rodeado de prosa");

    const badType = parseFacts('[{"type":"random","content":"x"}]');
    expect(badType.length === 0, "descarta type inválido");

    const noContent = parseFacts('[{"type":"semantic"}]');
    expect(noContent.length === 0, "descarta item sin content");

    const emptyContent = parseFacts('[{"type":"semantic","content":"   "}]');
    expect(emptyContent.length === 0, "descarta content vacío/espacios");

    expect(parseFacts("[]").length === 0, "array vacío → []");
    expect(parseFacts("no soy json").length === 0, "basura → []");
    expect(parseFacts('{"type":"semantic","content":"x"}').length === 0, "objeto (no array) → []");
    expect(
      parseFacts('[{"type":"semantic","content":"  espacios  "}]')[0]?.content ===
        "espacios",
      "trim del content",
    );
  }

  // ---------- dedupeBatch ----------
  console.log("\n[dedupeBatch]");
  {
    const dups = dedupeBatch([
      { type: "semantic", content: "Prefiere TypeScript" },
      { type: "semantic", content: "prefiere   typescript." }, // mismo tras normalizar
      { type: "semantic", content: "Usa Supabase" },
    ]);
    expect(dups.length === 2, "colapsa duplicados normalizados (mismo type)");

    const sameTextDiffType = dedupeBatch([
      { type: "semantic", content: "TypeScript" },
      { type: "procedural", content: "TypeScript" },
    ]);
    expect(
      sameTextDiffType.length === 2,
      "mismo texto pero distinto type → no se colapsan",
    );

    const distinct = dedupeBatch([
      { type: "episodic", content: "Evento A" },
      { type: "episodic", content: "Evento B" },
    ]);
    expect(distinct.length === 2, "contenidos distintos se conservan");

    expect(dedupeBatch([]).length === 0, "lote vacío → []");
  }

  // ---------- buildMemoryBlock ----------
  console.log("\n[buildMemoryBlock]");
  {
    const mems: MatchedMemory[] = [
      { id: "1", type: "semantic", content: "Prefiere TypeScript", retrieval_count: 3, similarity: 0.9 },
      { id: "2", type: "procedural", content: "Pide diagrama primero", retrieval_count: 1, similarity: 0.8 },
      { id: "3", type: "episodic", content: "El martes tuvo error de CORS", retrieval_count: 0, similarity: 0.7 },
    ];
    const block = buildMemoryBlock(mems);
    expect(block.startsWith("[MEMORIA DEL USUARIO]"), "abre con el marcador");
    expect(block.includes("[/MEMORIA DEL USUARIO]"), "cierra con el marcador");
    expect(block.includes("(preferencia) Prefiere TypeScript"), "etiqueta semantic → preferencia");
    expect(block.includes("(rutina) Pide diagrama primero"), "etiqueta procedural → rutina");
    expect(block.includes("(episódico) El martes tuvo error de CORS"), "etiqueta episodic → episódico");
  }

  // ---------- lastUserInput ----------
  console.log("\n[lastUserInput]");
  {
    const msgs = [
      new SystemMessage({ content: "sys" }),
      new HumanMessage({ content: "primer mensaje" }),
      new AIMessage({ content: "respuesta" }),
      new HumanMessage({ content: "último mensaje del usuario" }),
    ];
    expect(
      lastUserInput(msgs) === "último mensaje del usuario",
      "toma el HumanMessage más reciente",
    );

    expect(
      lastUserInput([new SystemMessage({ content: "sys" }), new AIMessage({ content: "ai" })]) ===
        null,
      "sin HumanMessage → null",
    );

    expect(
      lastUserInput([
        new HumanMessage({ content: "hola" }),
        new HumanMessage({ content: "   " }),
      ]) === "hola",
      "ignora HumanMessage vacío y cae al anterior con texto",
    );
  }

  // ---------- EN VIVO (opcional): embeddings ----------
  console.log("\n[embeddings en vivo (opcional)]");
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const vec = await generateEmbedding("hola mundo");
      expect(
        Array.isArray(vec) && vec.length === 1536,
        `generateEmbedding → vector de 1536 dims (recibí ${Array.isArray(vec) ? vec.length : typeof vec})`,
      );
    } catch (err) {
      expect(false, `generateEmbedding lanzó: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    console.log("  (saltado: define OPENROUTER_API_KEY para verificar embeddings en vivo)");
  }

  console.log(
    `\n${failed === 0 ? "✓ smoke-memory: todos los asserts pasaron" : `✗ smoke-memory: ${failed} asserts fallaron`}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("smoke-memory CRASH:", err);
  process.exit(1);
});
