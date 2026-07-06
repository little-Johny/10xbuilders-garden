import { randomUUID } from "node:crypto";
import { StateGraph, Command, interrupt } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { DbClient } from "@agents/db";
import type { UserToolSetting, UserIntegration } from "@agents/types";
import { createChatModel } from "./model";
import { buildLangChainTools, summariseToolCall } from "./tools/adapters";
import { getToolRisk } from "./tools/catalog";
import { getCheckpointer } from "./checkpointer";
import { GraphState } from "./state";
import { compactionNode } from "./nodes/compaction_node";
import { makeMemoryInjectionNode } from "./memory_injection_node";
import { createLangfuseHandler } from "./observability";
import {
  addMessage,
  createToolCall,
  findExistingPendingToolCall,
  getSessionMessages,
  updateMessageStructuredPayload,
  updateToolCallStatus,
} from "@agents/db";
import type { IntegrationsContext, PendingConfirmation } from "./types";

export type ResumeDecision = "approve" | "reject";

export interface AgentInput {
  /** New user message. Required for a new turn; omit when resuming. */
  message?: string;
  userId: string;
  sessionId: string;
  systemPrompt: string;
  db: DbClient;
  enabledTools: UserToolSetting[];
  integrations: UserIntegration[];
  /**
   * Runtime-only secrets (OAuth access tokens) that tools consume. Never
   * written to the DB, never echoed into the message history.
   */
  integrationsContext?: IntegrationsContext;
  /**
   * Set when resuming an interrupted graph (HITL approval). When present,
   * `message` is ignored and no new HumanMessage is persisted; the graph is
   * resumed via `Command(resume)` on the saved thread_id.
   */
  resumeDecision?: ResumeDecision;
  /**
   * Required when `resumeDecision` is set. The checkpoint thread the
   * interrupt was taken on (read from the pending tool_call row).
   */
  threadId?: string;
  /**
   * Skip HITL interrupts: medium/high tools execute directly without asking
   * for confirmation. Used by the scheduled-tasks tick for tasks marked
   * `autonomous=true` — at creation time the user already approved that the
   * agent should act unattended.
   */
  autonomous?: boolean;
}

export interface AgentOutput {
  /** Final assistant text, or null when the agent is awaiting confirmation. */
  response: string | null;
  toolCalls: string[];
  /** Set when a mutating tool was requested; the graph halted at an interrupt. */
  pendingConfirmation: PendingConfirmation | null;
  /**
   * True when the resume attempted to act on a thread that was already
   * resolved (race between two clients). Callers should surface a 409.
   */
  alreadyResolved?: boolean;
  /** Thread the turn ran on; useful for debugging/audit. */
  threadId: string;
}

const MAX_TOOL_ITERATIONS = 6;

/** Thrown when a resume attempt finds the thread is no longer interrupted. */
export class AlreadyResolvedError extends Error {
  constructor() {
    super("Thread already resolved");
    this.name = "AlreadyResolvedError";
  }
}

interface InterruptPayload {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
}

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const {
    message,
    userId,
    sessionId,
    systemPrompt,
    db,
    enabledTools,
    integrations,
    integrationsContext = {},
    resumeDecision,
  } = input;

  // R0 (post-mortem): each NEW turn runs on a fresh checkpoint thread.
  // Reusing thread_id=sessionId across turns let the LangGraph reducer
  // accumulate stale messages from prior turns (including AIMessages with
  // tool_calls that never got a matching ToolMessage persisted), which made
  // OpenAI reject the request with "tool_call_ids did not have response
  // messages". Per-turn threads keep each turn self-contained; for resume,
  // the caller provides the thread_id stored on the pending tool_call.
  let threadId: string;
  if (resumeDecision) {
    if (!input.threadId) {
      throw new Error(
        "runAgent: `threadId` is required when resuming (read it from the pending tool_call row).",
      );
    }
    threadId = input.threadId;
  } else {
    threadId = randomUUID();
  }

  const model = createChatModel();
  const lcTools = buildLangChainTools({
    db,
    userId,
    sessionId,
    enabledTools,
    integrations,
    integrationsContext,
  });

  const modelWithTools = lcTools.length > 0 ? model.bindTools(lcTools) : model;

  const toolCallNames: string[] = [];

  // Los nodos re-pasan `config` a cada invoke interno: es lo que propaga los
  // callbacks (Langfuse) hacia las llamadas LLM y tools; sin eso la traza
  // mostraría el grafo pero ninguna generación.
  async function agentNode(
    state: typeof GraphState.State,
    nodeConfig?: RunnableConfig,
  ): Promise<Partial<typeof GraphState.State>> {
    const response = await modelWithTools.invoke(state.messages, nodeConfig);
    return { messages: [response] };
  }

  async function toolExecutorNode(
    state: typeof GraphState.State,
    nodeConfig?: RunnableConfig,
  ): Promise<Partial<typeof GraphState.State>> {
    const lastMsg = state.messages[state.messages.length - 1];
    if (!(lastMsg instanceof AIMessage) || !lastMsg.tool_calls?.length) {
      return {};
    }

    const results: BaseMessage[] = [];
    for (const tc of lastMsg.tool_calls) {
      toolCallNames.push(tc.name);
      const matchingTool = lcTools.find((t) => t.name === tc.name);
      if (!matchingTool) {
        results.push(
          new ToolMessage({
            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
            tool_call_id: tc.id!,
          }),
        );
        continue;
      }

      const risk = getToolRisk(tc.name);
      const isMutating = risk === "medium" || risk === "high";
      const requiresConfirmation = !input.autonomous && isMutating;

      if (!requiresConfirmation) {
        // En modo autónomo + medium/high se ejecuta sin HITL pero queremos un
        // registro auditable (la tool en sí no llama a createToolCall en ese
        // path: ese contrato está documentado en adapters.ts). Para tools low,
        // las propias adapters llevan su auditoría — no duplicamos aquí.
        const args = (tc.args as Record<string, unknown>) ?? {};
        const auditRow =
          input.autonomous && isMutating
            ? await createToolCall(db, sessionId, tc.name, args, false, threadId)
            : null;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (matchingTool as any).invoke(tc.args, nodeConfig);
          if (auditRow) {
            const resultStr = String(result);
            let resultJson: Record<string, unknown>;
            try {
              resultJson = JSON.parse(resultStr) as Record<string, unknown>;
            } catch {
              resultJson = { result: resultStr };
            }
            await updateToolCallStatus(db, auditRow.id, "executed", resultJson);
          }
          results.push(
            new ToolMessage({
              content: String(result),
              tool_call_id: tc.id!,
            }),
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (auditRow) {
            await updateToolCallStatus(db, auditRow.id, "failed", { error: errMsg });
          }
          results.push(
            new ToolMessage({
              content: JSON.stringify({ error: errMsg }),
              tool_call_id: tc.id!,
            }),
          );
        }
        continue;
      }

      // --- HITL path (medium/high) ------------------------------------------
      // R1: the node re-runs from the start on resume → look up an existing
      // pending row first to avoid duplicating the audit trail. Only this
      // node ever creates the pending row (R2).
      const args = (tc.args as Record<string, unknown>) ?? {};
      const summary = await summariseToolCall(
        tc.name,
        args,
        integrationsContext,
      );

      let pendingRow = await findExistingPendingToolCall(
        db,
        sessionId,
        tc.name,
        threadId,
      );
      if (!pendingRow) {
        pendingRow = await createToolCall(
          db,
          sessionId,
          tc.name,
          args,
          true,
          threadId,
        );
      }

      // R1: do NOT wrap interrupt() in a try/catch — the runtime throws a
      // GraphInterrupt that must propagate up through the executor.
      const decision = interrupt({
        toolCallId: pendingRow.id,
        toolName: tc.name,
        args,
        summary,
      } satisfies InterruptPayload) as ResumeDecision;

      if (decision === "reject") {
        await updateToolCallStatus(db, pendingRow.id, "rejected");
        // R5: structured ToolMessage so the model can phrase the cancellation
        // naturally without orphan tool_calls.
        results.push(
          new ToolMessage({
            content: JSON.stringify({
              rejected: true,
              reason: "user_declined",
            }),
            tool_call_id: tc.id!,
          }),
        );
        continue;
      }

      // approve: execute the real side-effect now.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (matchingTool as any).invoke(tc.args, nodeConfig);
        const resultStr = String(result);
        let resultJson: Record<string, unknown>;
        try {
          resultJson = JSON.parse(resultStr) as Record<string, unknown>;
        } catch {
          resultJson = { result: resultStr };
        }
        await updateToolCallStatus(db, pendingRow.id, "executed", resultJson);
        results.push(
          new ToolMessage({ content: resultStr, tool_call_id: tc.id! }),
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await updateToolCallStatus(db, pendingRow.id, "failed", {
          error: errMsg,
        });
        results.push(
          new ToolMessage({
            content: JSON.stringify({ error: errMsg }),
            tool_call_id: tc.id!,
          }),
        );
      }
    }
    return { messages: results };
  }

  function shouldContinueAfterAgent(state: typeof GraphState.State): string {
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg instanceof AIMessage && lastMsg.tool_calls?.length) {
      const iterations = state.messages.filter(
        (m) => m instanceof AIMessage && (m as AIMessage).tool_calls?.length,
      ).length;
      if (iterations >= MAX_TOOL_ITERATIONS) return "end";
      return "tools";
    }
    return "end";
  }

  // memory_injection corre UNA vez por turno (en __start__), antes de compaction.
  // El loop tools→compaction nunca vuelve a este nodo, así que no se re-recuperan
  // recuerdos en cada iteración. En un resume de HITL el grafo retoma en `tools`,
  // no en __start__, por lo que tampoco se re-inyecta.
  const memoryInjectionNode = makeMemoryInjectionNode(db);

  const graph = new StateGraph(GraphState)
    .addNode("memory_injection", memoryInjectionNode)
    .addNode("compaction", compactionNode)
    .addNode("agent", agentNode)
    .addNode("tools", toolExecutorNode)
    .addEdge("__start__", "memory_injection")
    .addEdge("memory_injection", "compaction")
    .addEdge("compaction", "agent")
    .addConditionalEdges("agent", shouldContinueAfterAgent, {
      tools: "tools",
      end: "__end__",
    })
    .addEdge("tools", "compaction");

  const checkpointer = await getCheckpointer();
  const app = graph.compile({ checkpointer });

  // Tracing (Langfuse). Handler null si no hay credenciales en el entorno.
  const langfuseHandler = createLangfuseHandler({
    sessionId,
    userId,
    threadId,
    autonomous: !!input.autonomous,
  });

  const config: RunnableConfig = {
    configurable: { thread_id: threadId },
    ...(langfuseHandler ? { callbacks: [langfuseHandler] } : {}),
  };

  let finalState: typeof GraphState.State;

  if (resumeDecision) {
    // Resume branch. The thread must currently be interrupted; if it isn't
    // (race with another client), `getState().tasks[*].interrupts` will be
    // empty and we surface an AlreadyResolvedError to the caller.
    const before = await app.getState(config);
    const hasPending = (before.tasks ?? []).some(
      (t) => (t.interrupts?.length ?? 0) > 0,
    );
    if (!hasPending) {
      throw new AlreadyResolvedError();
    }
    finalState = (await app.invoke(
      new Command({ resume: resumeDecision }),
      config,
    )) as typeof GraphState.State;
  } else {
    if (!message) {
      throw new Error("runAgent: `message` is required when not resuming");
    }
    const history = await getSessionMessages(db, sessionId, 15);
    // Asignamos id explícito a cada BaseMessage. messagesStateReducer dedupe y
    // procesa RemoveMessage por id; sin id, compaction_node no puede eliminar
    // los mensajes viejos (ver state.ts y nodes/compaction_node.ts).
    const priorMessages: BaseMessage[] = history.map((m) => {
      const id = randomUUID();
      if (m.role === "user") return new HumanMessage({ id, content: m.content });
      if (m.role === "assistant") return new AIMessage({ id, content: m.content });
      return new HumanMessage({ id, content: m.content });
    });

    await addMessage(db, sessionId, "user", message);

    const initialMessages: BaseMessage[] = [
      new SystemMessage({ id: randomUUID(), content: systemPrompt }),
      ...priorMessages,
      new HumanMessage({ id: randomUUID(), content: message }),
    ];

    finalState = (await app.invoke(
      {
        messages: initialMessages,
        sessionId,
        userId,
        systemPrompt,
        compactionFailures: 0,
      },
      config,
    )) as typeof GraphState.State;
  }

  // El SDK de Langfuse batchea eventos en memoria; vaciamos la cola antes de
  // devolver la respuesta para no perder trazas si el proceso se recicla.
  await langfuseHandler?.flushAsync();

  // R6: detect interrupt via getState — `__interrupt__`/`tasks` keys do NOT
  // appear on the invoke result in this version of @langchain/langgraph.
  const after = await app.getState(config);
  const pendingTask = (after.tasks ?? []).find(
    (t) => (t.interrupts?.length ?? 0) > 0,
  );
  const interruptValue = pendingTask?.interrupts?.[0]?.value as
    | InterruptPayload
    | undefined;

  console.log("[runAgent]", {
    sessionId,
    threadId,
    resumeDecision: resumeDecision ?? null,
    finalMessagesCount: finalState.messages?.length ?? 0,
    hasInterrupt: !!interruptValue,
    interruptToolCallId: interruptValue?.toolCallId ?? null,
  });

  if (interruptValue) {
    const pending: PendingConfirmation = {
      toolCallId: interruptValue.toolCallId,
      toolName: interruptValue.toolName,
      args: interruptValue.args ?? {},
      summary: interruptValue.summary ?? "",
    };

    // Look up existing pending-card message in JS (the JSONB-path filter in
    // supabase-js is finicky and was silently mis-matching). We only persist
    // once per (session, tool_call_id); the UI dedupes the card by
    // tool_call_id either way.
    const { data: assistantMsgs } = await db
      .from("agent_messages")
      .select("id, structured_payload")
      .eq("session_id", sessionId)
      .eq("role", "assistant");
    const alreadyPersisted = (assistantMsgs ?? []).some((m) => {
      const p = m.structured_payload as { tool_call_id?: string } | null;
      return p?.tool_call_id === pending.toolCallId;
    });

    if (!alreadyPersisted) {
      const saved = await addMessage(db, sessionId, "assistant", "", {
        structured_payload: {
          type: "pending_confirmation",
          tool_call_id: pending.toolCallId,
          tool_name: pending.toolName,
          args: pending.args,
          summary: pending.summary,
        },
      });
      console.log("[runAgent] persisted pending card", {
        messageId: saved.id,
        toolCallId: pending.toolCallId,
      });
    } else {
      console.log("[runAgent] pending card already persisted", {
        toolCallId: pending.toolCallId,
      });
    }

    return {
      response: null,
      toolCalls: toolCallNames,
      pendingConfirmation: pending,
      threadId,
    };
  }

  // No interrupt → flow completed. If we just resolved one (resume branch),
  // mark the prior pending message as resolved (R3) so the card disappears
  // after refresh.
  if (resumeDecision) {
    const { data: assistantMsgs } = await db
      .from("agent_messages")
      .select("id, structured_payload, created_at")
      .eq("session_id", sessionId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false });
    const priorPending = (assistantMsgs ?? []).find((m) => {
      const p = m.structured_payload as
        | { type?: string; resolved?: boolean }
        | null;
      return p?.type === "pending_confirmation" && p?.resolved !== true;
    });
    if (priorPending?.id) {
      await updateMessageStructuredPayload(db, priorPending.id, {
        resolved: true,
        decision: resumeDecision,
      });
    }
  }

  const lastMessage = finalState.messages?.[finalState.messages.length - 1];
  if (!lastMessage) {
    console.warn("[runAgent] finalState.messages is empty after invoke", {
      sessionId,
      threadId,
      resumeDecision,
      stateKeys: Object.keys(finalState),
    });
    return {
      response: null,
      toolCalls: toolCallNames,
      pendingConfirmation: null,
      threadId,
    };
  }
  const responseText =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

  const savedAssistant = await addMessage(
    db,
    sessionId,
    "assistant",
    responseText,
  );
  console.log("[runAgent] persisted assistant reply", {
    messageId: savedAssistant.id,
    sessionId,
    threadId,
    chars: responseText.length,
    resumeDecision: resumeDecision ?? null,
  });

  return {
    response: responseText,
    toolCalls: toolCallNames,
    pendingConfirmation: null,
    threadId,
  };
}
