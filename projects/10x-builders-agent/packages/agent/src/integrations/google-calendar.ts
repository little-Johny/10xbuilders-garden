/**
 * Minimal Google Calendar REST client used by the agent's tools. Mirrors the
 * shape of `./github.ts`: each method takes the user's access token and goes
 * straight to the REST API; error handling throws with status + path + a
 * truncated body for diagnostics.
 *
 * The agent passes recurrence as a high-level object; we translate it to an
 * RFC 5545 RRULE before hitting the API. Only the `primary` calendar is
 * supported in this iteration; `calendarId` is wired through as an internal
 * parameter so multi-calendar can be added later without breaking changes.
 */

const GCAL_API = "https://www.googleapis.com/calendar/v3";

async function gcalFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${GCAL_API}${path}`, {
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
    throw new Error(
      `Google Calendar error ${res.status} on ${init.method ?? "GET"} ${path}: ${bodyText.slice(0, 200)}`
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

export type WeekDay = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  byDay?: WeekDay[];
  byMonthDay?: number;
  count?: number;
  until?: string; // RFC3339, mutually exclusive with count
}

/**
 * Translates a high-level Recurrence object into an RFC 5545 RRULE string
 * suitable for the `recurrence` field of a Google Calendar event.
 *
 * Examples:
 *   { frequency: "weekly", byDay: ["MO"] }                    → "RRULE:FREQ=WEEKLY;BYDAY=MO"
 *   { frequency: "weekly", byDay: ["MO","TU","WE","TH","FR"] } → "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
 *   { frequency: "weekly", interval: 2, byDay: ["WE"] }       → "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE"
 *   { frequency: "monthly", byMonthDay: 1 }                   → "RRULE:FREQ=MONTHLY;BYMONTHDAY=1"
 */
export function recurrenceToRRule(r: Recurrence): string {
  if (r.count !== undefined && r.until !== undefined) {
    throw new Error("Recurrence: `count` and `until` are mutually exclusive");
  }
  const parts: string[] = [`FREQ=${r.frequency.toUpperCase()}`];
  if (r.interval && r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.byDay && r.byDay.length > 0) parts.push(`BYDAY=${r.byDay.join(",")}`);
  if (r.byMonthDay !== undefined) parts.push(`BYMONTHDAY=${r.byMonthDay}`);
  if (r.count !== undefined) parts.push(`COUNT=${r.count}`);
  if (r.until !== undefined) {
    // RRULE UNTIL must be in basic format YYYYMMDDTHHMMSSZ (UTC) per RFC 5545.
    const d = new Date(r.until);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Recurrence: invalid \`until\` value: ${r.until}`);
    }
    const iso = d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    parts.push(`UNTIL=${iso}`);
  }
  return `RRULE:${parts.join(";")}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GcalDateTime {
  dateTime: string;
  timeZone: string;
}

export interface GcalEventSummary {
  id: string;
  summary: string;
  htmlLink?: string;
  start?: GcalDateTime;
  end?: GcalDateTime;
  recurringEventId?: string;
  status?: string;
}

export interface GcalEvent extends GcalEventSummary {
  description?: string;
  attendees?: { email: string; responseStatus?: string }[];
  recurrence?: string[];
  originalStartTime?: GcalDateTime;
}

interface RawListResponse {
  items?: GcalEvent[];
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function listEvents(
  accessToken: string,
  params: {
    calendarId?: string;
    timeMin: string;
    timeMax: string;
    timeZone?: string;
    maxResults?: number;
    q?: string;
  }
): Promise<GcalEventSummary[]> {
  const calendarId = params.calendarId ?? "primary";
  const qs = new URLSearchParams({
    timeMin: params.timeMin,
    timeMax: params.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.max(1, Math.min(params.maxResults ?? 50, 250))),
  });
  if (params.timeZone) qs.set("timeZone", params.timeZone);
  if (params.q) qs.set("q", params.q);
  const data = await gcalFetch<RawListResponse>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`
  );
  return (data.items ?? []).map((i) => ({
    id: i.id,
    summary: i.summary,
    htmlLink: i.htmlLink,
    start: i.start,
    end: i.end,
    recurringEventId: i.recurringEventId,
    status: i.status,
  }));
}

export async function getEvent(
  accessToken: string,
  params: { calendarId?: string; eventId: string }
): Promise<GcalEvent> {
  const calendarId = params.calendarId ?? "primary";
  return gcalFetch<GcalEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`
  );
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

export interface CreateEventParams {
  calendarId?: string;
  summary: string;
  description?: string;
  start: GcalDateTime;
  end: GcalDateTime;
  attendees?: { email: string }[];
  recurrence?: Recurrence;
}

export async function createEvent(
  accessToken: string,
  params: CreateEventParams
): Promise<GcalEvent> {
  const calendarId = params.calendarId ?? "primary";
  const body: Record<string, unknown> = {
    summary: params.summary,
    description: params.description,
    start: params.start,
    end: params.end,
  };
  if (params.attendees && params.attendees.length > 0) {
    body.attendees = params.attendees.map((a) => ({ email: a.email }));
  }
  if (params.recurrence) {
    body.recurrence = [recurrenceToRRule(params.recurrence)];
  }
  return gcalFetch<GcalEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export interface UpdateEventParams {
  calendarId?: string;
  eventId: string;
  scope: "instance" | "series";
  summary?: string;
  description?: string;
  start?: GcalDateTime;
  end?: GcalDateTime;
  recurrence?: Recurrence | null; // null clears recurrence on the master
}

/**
 * For `scope: "series"` we patch the master event id directly. For
 * `scope: "instance"` we expect the caller to pass the **instance** id
 * (the expanded id returned by `listEvents` with `singleEvents=true`),
 * not the master `recurringEventId`. Patching that instance id only
 * affects that single occurrence — Google handles the exception under
 * the hood via `originalStartTime`.
 */
export async function updateEvent(
  accessToken: string,
  params: UpdateEventParams
): Promise<GcalEvent> {
  const calendarId = params.calendarId ?? "primary";
  const body: Record<string, unknown> = {};
  if (params.summary !== undefined) body.summary = params.summary;
  if (params.description !== undefined) body.description = params.description;
  if (params.start !== undefined) body.start = params.start;
  if (params.end !== undefined) body.end = params.end;
  if (params.recurrence !== undefined) {
    body.recurrence = params.recurrence === null ? [] : [recurrenceToRRule(params.recurrence)];
  }
  return gcalFetch<GcalEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export interface DeleteEventParams {
  calendarId?: string;
  eventId: string;
  scope: "instance" | "series";
}

export async function deleteEvent(
  accessToken: string,
  params: DeleteEventParams
): Promise<void> {
  const calendarId = params.calendarId ?? "primary";
  await gcalFetch<void>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`,
    { method: "DELETE" }
  );
}

// ---------------------------------------------------------------------------
// Conflict detection (used before creating a recurring event)
// ---------------------------------------------------------------------------

export async function findConflictsInWindow(
  accessToken: string,
  params: {
    calendarId?: string;
    start: string;
    end: string;
    timeZone?: string;
  }
): Promise<GcalEventSummary[]> {
  return listEvents(accessToken, {
    calendarId: params.calendarId,
    timeMin: params.start,
    timeMax: params.end,
    timeZone: params.timeZone,
    maxResults: 50,
  });
}
