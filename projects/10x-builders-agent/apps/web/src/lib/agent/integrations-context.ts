import { getDecryptedAccessToken, getUserIntegration, type DbClient } from "@agents/db";
import type { IntegrationsContext } from "@agents/agent";

/**
 * Builds the server-only `IntegrationsContext` for a given user. Decrypts the
 * GitHub access token on the fly; the result is meant to live only in memory
 * for the duration of a single agent invocation and must NOT be serialised
 * into any response, cookie, or log line.
 */
export async function loadIntegrationsContext(
  db: DbClient,
  userId: string
): Promise<IntegrationsContext> {
  const ctx: IntegrationsContext = {};

  try {
    const integration = await getUserIntegration(db, userId, "github");
    if (integration && integration.status === "active") {
      const token = await getDecryptedAccessToken(db, userId, "github");
      if (token) {
        ctx.github = {
          accessToken: token,
          login: integration.provider_account_login ?? undefined,
        };
      }
    }
  } catch (e) {
    // Treat decryption / DB failures as "not connected". The agent will still
    // run, just without GitHub tools — surfacing the error to the user here
    // would leak implementation details we'd rather keep private.
    console.error("loadIntegrationsContext(github) failed:", e);
  }

  return ctx;
}
