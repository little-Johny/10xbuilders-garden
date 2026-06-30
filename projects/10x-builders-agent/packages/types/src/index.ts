export type Channel = "web" | "telegram" | "scheduled";

export type ToolRisk = "low" | "medium" | "high";

export type NotificationChannel = "telegram";

export type ScheduledTaskStatus = "active" | "paused" | "completed" | "failed";

export interface ScheduledTask {
  id: string;
  user_id: string;
  name: string;
  description: string;
  cron_expression: string;
  /** IANA timezone; null falls back to the user's profile timezone. */
  timezone: string | null;
  start_at: string | null;
  end_at: string | null;
  last_execution: string | null;
  /** Pre-computed next fire time so /tick can skip a full table scan. */
  next_execution: string | null;
  enabled: boolean;
  /** When true, the cron-fired run skips HITL interrupts. */
  autonomous: boolean;
  notification_channels: NotificationChannel[];
  status: ScheduledTaskStatus;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  name: string;
  timezone: string;
  language: string;
  agent_name: string;
  agent_system_prompt: string;
  onboarding_completed: boolean;
  /** Minutos de inactividad tras los que el sweep cierra/flushea la sesión (5–1440). */
  memory_flush_idle_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface UserIntegration {
  id: string;
  user_id: string;
  provider: string;
  scopes: string[];
  status: "active" | "revoked" | "expired";
  provider_account_id?: string | null;
  provider_account_login?: string | null;
  access_token_expires_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface UserToolSetting {
  id: string;
  user_id: string;
  tool_id: string;
  enabled: boolean;
  config_json: Record<string, unknown>;
}

export interface UserSheet {
  id: string;
  user_id: string;
  alias: string;
  spreadsheet_id: string;
  default_tab: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentSession {
  id: string;
  user_id: string;
  channel: Channel;
  status: "active" | "closed";
  budget_tokens_used: number;
  budget_tokens_limit: number;
  created_at: string;
  updated_at: string;
  /** Set when memory_flush finished for this (closed) session. Null = pending/retry. */
  flushed_at?: string | null;
}

export type MemoryType = "episodic" | "semantic" | "procedural";

export interface Memory {
  id: string;
  user_id: string;
  type: MemoryType;
  content: string;
  /** Embedding vector (1536 dims, text-embedding-3-small). */
  embedding: number[];
  retrieval_count: number;
  created_at: string;
  last_retrieved_at: string | null;
}

export type MessageRole = "user" | "assistant" | "tool" | "system";

export interface AgentMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  tool_call_id?: string;
  structured_payload?: Record<string, unknown>;
  created_at: string;
}

export interface ToolCall {
  id: string;
  session_id: string;
  tool_name: string;
  arguments_json: Record<string, unknown>;
  result_json?: Record<string, unknown>;
  status: "pending_confirmation" | "approved" | "rejected" | "executed" | "failed";
  requires_confirmation: boolean;
  /** LangGraph checkpoint thread; populated for medium/high-risk pendings. */
  thread_id?: string | null;
  created_at: string;
  finished_at?: string;
}

export interface TelegramAccount {
  id: string;
  user_id: string;
  telegram_user_id: number;
  chat_id: number;
  linked_at: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  risk: ToolRisk;
  requires_integration?: string;
  parameters_schema: Record<string, unknown>;
}
