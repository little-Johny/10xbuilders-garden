import { google } from 'googleapis';
import { getEnv } from '../config/env.js';

/**
 * Single OAuth scope used by the agent. Granting any other scope is
 * forbidden by the guardrails (§2.2 minimum privilege).
 */
export const SHEETS_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/spreadsheets',
]);

/** @type {import('googleapis').sheets_v4.Sheets | null} */
let cachedClient = null;

/**
 * Returns a cached, authenticated Google Sheets client.
 * The client is constructed lazily on first call.
 *
 * @returns {import('googleapis').sheets_v4.Sheets}
 */
export function getSheetsClient() {
  if (cachedClient) return cachedClient;
  const env = getEnv();
  const auth = new google.auth.GoogleAuth({
    keyFile: env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: [...SHEETS_SCOPES],
  });
  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

/**
 * Test-only helper to swap or reset the cached client.
 * @param {import('googleapis').sheets_v4.Sheets | null} client
 */
export function setSheetsClientForTests(client) {
  cachedClient = client;
}
