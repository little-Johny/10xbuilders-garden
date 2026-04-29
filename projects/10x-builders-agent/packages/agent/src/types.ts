/**
 * Access tokens and other secrets the agent needs at runtime but that must
 * never appear in the conversation transcript or be persisted alongside
 * messages. The top-level `/api/chat` and Telegram webhook handlers build this
 * object in-memory (decrypting tokens on the server) and pass it in-process
 * to `runAgent`; the graph never writes any field of this object to the DB.
 */
export interface IntegrationsContext {
  github?: {
    accessToken: string;
    login?: string;
  };
  google?: {
    accessToken: string;
    email?: string;
    /**
     * IANA timezone of the connected user (e.g. "America/Bogota"). Used by
     * Calendar tools to anchor events the user describes in local terms
     * ("mañana a las 10am") to a concrete RFC3339 instant.
     */
    timeZone?: string;
  };
}

export interface PendingConfirmation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
}
