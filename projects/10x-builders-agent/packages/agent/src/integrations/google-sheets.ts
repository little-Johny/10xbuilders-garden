/**
 * Minimal Google Sheets REST client used by the agent's tools. Mirrors the
 * shape of `./google-calendar.ts`: each method takes the user's access token
 * and goes straight to the REST API; error handling throws with status + path
 * + a truncated body for diagnostics.
 *
 * The caller (adapter layer) is responsible for the `spreadsheetId` — this
 * module never searches by name nor invents IDs.
 */

const GSHEETS_API = "https://sheets.googleapis.com/v4";

const SPREADSHEET_ID_RE = /^[A-Za-z0-9_-]{20,}$/;
const A1_RE = /^([^!]+!)?[A-Z]+\d*(:[A-Z]+\d*)?$/;
const WRITE_CELL_LIMIT = 10_000;

export function assertSpreadsheetId(id: string): void {
  if (!SPREADSHEET_ID_RE.test(id)) {
    throw new Error(
      `Invalid spreadsheetId "${id}": expected a base64-like token of at least 20 chars`
    );
  }
}

export function assertA1(range: string): void {
  if (!A1_RE.test(range)) {
    throw new Error(
      `Invalid A1 range "${range}": expected "SheetName!A1:B10", "A1:B10" or "SheetName!A:A"`
    );
  }
}

export function assertWriteSize(values: unknown[][]): void {
  let cells = 0;
  for (const row of values) cells += row.length;
  if (cells > WRITE_CELL_LIMIT) {
    throw new Error(
      `Write rejected: ${cells} cells exceeds limit of ${WRITE_CELL_LIMIT}. Split into smaller calls.`
    );
  }
}

/**
 * Detects 403/PERMISSION_DENIED with scope errors and re-throws with an
 * actionable message asking the user to reconnect Google. Other errors are
 * re-thrown verbatim.
 */
function mapSheetsError(status: number, body: string, method: string, path: string): Error {
  const isScopeError =
    status === 403 &&
    (body.includes("insufficientPermissions") ||
      body.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") ||
      body.includes("PERMISSION_DENIED"));
  if (isScopeError) {
    return new Error(
      "Google Sheets: scope insuficiente. Reconectá Google en Settings para autorizar Sheets."
    );
  }
  return new Error(
    `Google Sheets error ${status} on ${method} ${path}: ${body.slice(0, 200)}`
  );
}

async function sheetsFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${GSHEETS_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw mapSheetsError(res.status, bodyText, init.method ?? "GET", path);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CellValue = string | number | boolean | null;
export type CellRow = CellValue[];

export interface SheetTab {
  title: string;
  sheetId: number;
  gridProperties?: { rowCount: number; columnCount: number };
}

export interface ValueRange {
  range: string;
  values: CellRow[];
}

export interface AppendResult {
  updatedRange: string;
  updatedRows: number;
  updatedCells: number;
}

export interface UpdateResult {
  updatedRange: string;
  updatedRows: number;
  updatedCells: number;
}

export interface CreateSpreadsheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheets: { title: string; sheetId: number }[];
}

export type ValueRenderOption = "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA";
export type ValueInputOption = "RAW" | "USER_ENTERED";

interface RawSheet {
  properties?: {
    title?: string;
    sheetId?: number;
    gridProperties?: { rowCount?: number; columnCount?: number };
  };
}

interface RawSpreadsheetGet {
  sheets?: RawSheet[];
}

interface RawValuesGet {
  range?: string;
  values?: CellRow[];
}

interface RawAppend {
  updates?: {
    updatedRange?: string;
    updatedRows?: number;
    updatedCells?: number;
  };
}

interface RawUpdate {
  updatedRange?: string;
  updatedRows?: number;
  updatedCells?: number;
}

interface RawCreate {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  sheets?: RawSheet[];
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function listSheets(
  accessToken: string,
  params: { spreadsheetId: string }
): Promise<{ sheets: SheetTab[] }> {
  assertSpreadsheetId(params.spreadsheetId);
  const qs = new URLSearchParams({
    fields: "sheets(properties(title,sheetId,gridProperties(rowCount,columnCount)))",
  });
  const data = await sheetsFetch<RawSpreadsheetGet>(
    accessToken,
    `/spreadsheets/${encodeURIComponent(params.spreadsheetId)}?${qs.toString()}`
  );
  const sheets: SheetTab[] = (data.sheets ?? [])
    .filter((s) => s.properties && typeof s.properties.title === "string" && typeof s.properties.sheetId === "number")
    .map((s) => ({
      title: s.properties!.title as string,
      sheetId: s.properties!.sheetId as number,
      gridProperties:
        s.properties!.gridProperties &&
        typeof s.properties!.gridProperties.rowCount === "number" &&
        typeof s.properties!.gridProperties.columnCount === "number"
          ? {
              rowCount: s.properties!.gridProperties.rowCount,
              columnCount: s.properties!.gridProperties.columnCount,
            }
          : undefined,
    }));
  return { sheets };
}

export async function readRange(
  accessToken: string,
  params: {
    spreadsheetId: string;
    range: string;
    valueRenderOption?: ValueRenderOption;
  }
): Promise<ValueRange> {
  assertSpreadsheetId(params.spreadsheetId);
  assertA1(params.range);
  const qs = new URLSearchParams();
  if (params.valueRenderOption) qs.set("valueRenderOption", params.valueRenderOption);
  const path = `/spreadsheets/${encodeURIComponent(params.spreadsheetId)}/values/${encodeURIComponent(params.range)}${qs.toString() ? `?${qs.toString()}` : ""}`;
  const data = await sheetsFetch<RawValuesGet>(accessToken, path);
  return {
    range: data.range ?? params.range,
    values: data.values ?? [],
  };
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

export async function appendRow(
  accessToken: string,
  params: {
    spreadsheetId: string;
    range: string;
    values: CellRow;
    valueInputOption?: ValueInputOption;
  }
): Promise<AppendResult> {
  assertSpreadsheetId(params.spreadsheetId);
  assertA1(params.range);
  assertWriteSize([params.values]);
  const qs = new URLSearchParams({
    valueInputOption: params.valueInputOption ?? "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    includeValuesInResponse: "false",
  });
  const data = await sheetsFetch<RawAppend>(
    accessToken,
    `/spreadsheets/${encodeURIComponent(params.spreadsheetId)}/values/${encodeURIComponent(params.range)}:append?${qs.toString()}`,
    {
      method: "POST",
      body: JSON.stringify({
        range: params.range,
        majorDimension: "ROWS",
        values: [params.values],
      }),
    }
  );
  return {
    updatedRange: data.updates?.updatedRange ?? params.range,
    updatedRows: data.updates?.updatedRows ?? 0,
    updatedCells: data.updates?.updatedCells ?? 0,
  };
}

export async function updateRange(
  accessToken: string,
  params: {
    spreadsheetId: string;
    range: string;
    values: CellRow[];
    valueInputOption?: ValueInputOption;
  }
): Promise<UpdateResult> {
  assertSpreadsheetId(params.spreadsheetId);
  assertA1(params.range);
  assertWriteSize(params.values);
  const qs = new URLSearchParams({
    valueInputOption: params.valueInputOption ?? "USER_ENTERED",
    includeValuesInResponse: "false",
  });
  const data = await sheetsFetch<RawUpdate>(
    accessToken,
    `/spreadsheets/${encodeURIComponent(params.spreadsheetId)}/values/${encodeURIComponent(params.range)}?${qs.toString()}`,
    {
      method: "PUT",
      body: JSON.stringify({
        range: params.range,
        majorDimension: "ROWS",
        values: params.values,
      }),
    }
  );
  return {
    updatedRange: data.updatedRange ?? params.range,
    updatedRows: data.updatedRows ?? 0,
    updatedCells: data.updatedCells ?? 0,
  };
}

export async function createSpreadsheet(
  accessToken: string,
  params: {
    title: string;
    sheets?: { title: string }[];
  }
): Promise<CreateSpreadsheetResult> {
  const body: Record<string, unknown> = {
    properties: { title: params.title },
  };
  if (params.sheets && params.sheets.length > 0) {
    body.sheets = params.sheets.map((s) => ({ properties: { title: s.title } }));
  }
  const data = await sheetsFetch<RawCreate>(accessToken, `/spreadsheets`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!data.spreadsheetId || !data.spreadsheetUrl) {
    throw new Error("Google Sheets create: respuesta sin spreadsheetId/spreadsheetUrl");
  }
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    sheets: (data.sheets ?? [])
      .filter((s) => s.properties && typeof s.properties.title === "string" && typeof s.properties.sheetId === "number")
      .map((s) => ({
        title: s.properties!.title as string,
        sheetId: s.properties!.sheetId as number,
      })),
  };
}
