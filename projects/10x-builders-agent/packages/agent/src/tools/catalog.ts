import type { ToolDefinition, ToolRisk } from "@agents/types";

export const TOOL_CATALOG: ToolDefinition[] = [
  {
    id: "get_user_preferences",
    name: "get_user_preferences",
    description: "Returns the current user preferences and agent configuration.",
    risk: "low",
    parameters_schema: { type: "object", properties: {}, required: [] },
  },
  {
    id: "list_enabled_tools",
    name: "list_enabled_tools",
    description: "Lists all tools the user has currently enabled.",
    risk: "low",
    parameters_schema: { type: "object", properties: {}, required: [] },
  },
  {
    id: "github_list_repos",
    name: "github_list_repos",
    description: "Lists the user's GitHub repositories.",
    risk: "low",
    requires_integration: "github",
    parameters_schema: {
      type: "object",
      properties: {
        per_page: { type: "number", description: "Results per page (max 30)" },
      },
      required: [],
    },
  },
  {
    id: "github_list_issues",
    name: "github_list_issues",
    description: "Lists issues for a given repository.",
    risk: "low",
    requires_integration: "github",
    parameters_schema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        state: { type: "string", enum: ["open", "closed", "all"] },
      },
      required: ["owner", "repo"],
    },
  },
  {
    id: "github_create_issue",
    name: "github_create_issue",
    description:
      "Creates a new issue in a GitHub repository. Requires user confirmation before executing.",
    risk: "medium",
    requires_integration: "github",
    parameters_schema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["owner", "repo", "title"],
    },
  },
  {
    id: "github_create_repo",
    name: "github_create_repo",
    description:
      "Creates a new repository in the authenticated user's GitHub account. Requires user confirmation before executing.",
    risk: "high",
    requires_integration: "github",
    parameters_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        private: { type: "boolean" },
      },
      required: ["name"],
    },
  },
  {
    id: "gcal_list_events",
    name: "gcal_list_events",
    description:
      "Lists Google Calendar events on the user's primary calendar within a time range. Recurrences are expanded into individual instances.",
    risk: "low",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        time_min: { type: "string", description: "RFC3339 start of range" },
        time_max: { type: "string", description: "RFC3339 end of range" },
        q: { type: "string", description: "Optional free-text query" },
      },
      required: ["time_min", "time_max"],
    },
  },
  {
    id: "gcal_get_event",
    name: "gcal_get_event",
    description:
      "Fetches the full details of a single Google Calendar event by id, including its recurrence rule if any.",
    risk: "low",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        event_id: { type: "string" },
      },
      required: ["event_id"],
    },
  },
  {
    id: "gcal_create_event",
    name: "gcal_create_event",
    description:
      "Creates an event on the user's primary Google Calendar. Supports recurring events. Requires user confirmation before executing.",
    risk: "medium",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        description: { type: "string" },
        start: { type: "string", description: "RFC3339 start datetime" },
        end: { type: "string", description: "RFC3339 end datetime" },
        time_zone: { type: "string", description: "IANA timezone (defaults to user's)" },
        attendees: { type: "array", items: { type: "string" } },
        recurrence: { type: "object" },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    id: "gcal_update_event",
    name: "gcal_update_event",
    description:
      "Modifies an existing Google Calendar event. Use scope='instance' to change a single occurrence (pass the instance id from gcal_list_events) or scope='series' to change the master event. Requires user confirmation.",
    risk: "medium",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        scope: { type: "string", enum: ["instance", "series"] },
        summary: { type: "string" },
        description: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        time_zone: { type: "string" },
      },
      required: ["event_id", "scope"],
    },
  },
  {
    id: "gcal_delete_event",
    name: "gcal_delete_event",
    description:
      "Deletes a Google Calendar event. Use scope='instance' to delete a single occurrence (pass the instance id) or scope='series' to delete the entire recurring event. Requires user confirmation.",
    risk: "high",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        scope: { type: "string", enum: ["instance", "series"] },
      },
      required: ["event_id", "scope"],
    },
  },
];

export function getToolRisk(toolId: string): ToolRisk {
  return TOOL_CATALOG.find((t) => t.id === toolId)?.risk ?? "high";
}

export function toolRequiresConfirmation(toolId: string): boolean {
  const risk = getToolRisk(toolId);
  return risk === "medium" || risk === "high";
}
