import {
  getDecryptedAccessToken,
  getProfile,
  getUserIntegration,
  type DbClient,
} from "@agents/db";
import type { IntegrationsContext } from "@agents/agent";
import { ensureFreshGoogleAccessToken } from "@/lib/google/access-token";

/**
 * Builds the server-only `IntegrationsContext` for a given user. Decrypts
 * third-party access tokens on the fly; the result is meant to live only in
 * memory for the duration of a single agent invocation and must NOT be
 * serialised into any response, cookie, or log line.
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

  try {
    const integration = await getUserIntegration(db, userId, "google");
    if (integration && integration.status === "active") {
      const fresh = await ensureFreshGoogleAccessToken(db, userId);
      if (fresh) {
        // Anchor calendar events in the user's profile timezone; if the user
        // hasn't set one, fall back to UTC so the agent has *something* to
        // anchor relative phrases like "tomorrow at 10am" to.
        let tz: string | undefined;
        try {
          const profile = await getProfile(db, userId);
          tz = profile.timezone;
        } catch {
          tz = undefined;
        }
        ctx.google = {
          accessToken: fresh.accessToken,
          email: integration.provider_account_login ?? undefined,
          timeZone: tz,
        };
      }
    }
  } catch (e) {
    console.error("loadIntegrationsContext(google) failed:", e);
  }

  return ctx;
}
