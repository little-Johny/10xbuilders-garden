/**
 * Genera embeddings vía OpenRouter con `fetch` directo (sin SDK), usando el
 * endpoint OpenAI-compatible. Mismo proveedor/llave que el chat
 * (`OPENROUTER_API_KEY`); el modelo por defecto es `text-embedding-3-small`
 * (1536 dims), configurable con `OPENROUTER_EMBEDDING_MODEL`.
 *
 * Se usa en dos momentos:
 *  - memory_flush: por cada hecho extraído, para almacenar su embedding.
 *  - memory_injection_node: sobre el input del usuario, para buscar por similitud.
 */
const EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

function embeddingModel(): string {
  return process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";
}

interface EmbeddingsResponse {
  data?: Array<{ embedding?: number[] }>;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  const res = await fetch(EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://agents.local",
    },
    body: JSON.stringify({ model: embeddingModel(), input: text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Embeddings request failed: ${res.status} ${res.statusText} ${body}`.trim(),
    );
  }

  const json = (await res.json()) as EmbeddingsResponse;
  const embedding = json.data?.[0]?.embedding;
  if (!embedding || embedding.length === 0) {
    throw new Error("Embeddings response missing data[0].embedding");
  }
  return embedding;
}
