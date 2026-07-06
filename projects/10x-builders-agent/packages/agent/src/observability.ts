import { CallbackHandler } from "langfuse-langchain";

export interface LangfuseHandlerParams {
  sessionId: string;
  userId: string;
  threadId: string;
  autonomous: boolean;
}

/**
 * Crea el CallbackHandler de Langfuse para UNA invocación del grafo.
 *
 * Las credenciales viven en `.env.local` de apps/web (Next.js las carga en
 * process.env del server); aquí solo se leen, nunca se hardcodean. Si faltan,
 * devolvemos null y el agente corre sin tracing — la observabilidad no debe
 * tumbar al agente en entornos sin Langfuse (CI, otros devs).
 *
 * Handler por invocación (y no singleton) para fijar sessionId/userId por
 * turno: así Langfuse agrupa las trazas por sesión y usuario.
 */
export function createLangfuseHandler(
  params: LangfuseHandlerParams,
): CallbackHandler | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return null;

  return new CallbackHandler({
    publicKey,
    secretKey,
    // El SDK clásico lee LANGFUSE_BASEURL; nuestro .env usa LANGFUSE_BASE_URL.
    // Aceptamos ambas; sin ninguna, el SDK apunta a Langfuse Cloud.
    baseUrl: process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_BASEURL,
    sessionId: params.sessionId,
    userId: params.userId,
    metadata: {
      threadId: params.threadId,
      autonomous: params.autonomous,
    },
    tags: [params.autonomous ? "autonomous" : "interactive"],
  });
}
