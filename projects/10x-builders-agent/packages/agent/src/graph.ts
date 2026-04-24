import { StateGraph, Annotation, MemorySaver } from "@langchain/langgraph";
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
import { ConfirmationRequiredError, buildLangChainTools } from "./tools/adapters";
import { createToolCall, getSessionMessages, addMessage } from "@agents/db";
import type { IntegrationsContext, PendingConfirmation } from "./types";

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  sessionId: Annotation<string>(),
  userId: Annotation<string>(),
  systemPrompt: Annotation<string>(),
  pendingConfirmation: Annotation<PendingConfirmation | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export interface AgentInput {
  message: string;
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
}

export interface AgentOutput {
  /** Final assistant text, or null when the agent is awaiting confirmation. */
  response: string | null;
  toolCalls: string[];
  /** Set when a mutating tool was requested; the graph halted without calling the model again. */
  pendingConfirmation: PendingConfirmation | null;
}

const MAX_TOOL_ITERATIONS = 6;

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
  } = input;

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

  const history = await getSessionMessages(db, sessionId, 30);
  const priorMessages: BaseMessage[] = history.map((m) => {
    if (m.role === "user") return new HumanMessage(m.content);
    if (m.role === "assistant") return new AIMessage(m.content);
    return new HumanMessage(m.content);
  });

  await addMessage(db, sessionId, "user", message);

  const toolCallNames: string[] = [];

  async function agentNode(
    state: typeof GraphState.State
  ): Promise<Partial<typeof GraphState.State>> {
    const response = await modelWithTools.invoke(state.messages);
    return { messages: [response] };
  }

  async function toolExecutorNode(
    state: typeof GraphState.State
  ): Promise<Partial<typeof GraphState.State>> {
    const lastMsg = state.messages[state.messages.length - 1];
    if (!(lastMsg instanceof AIMessage) || !lastMsg.tool_calls?.length) {
      return {};
    }

    const results: BaseMessage[] = [];
    for (const tc of lastMsg.tool_calls) {
      const matchingTool = lcTools.find((t) => t.name === tc.name);
      toolCallNames.push(tc.name);
      if (!matchingTool) {
        results.push(
          new ToolMessage({
            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
            tool_call_id: tc.id!,
          })
        );
        continue;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (matchingTool as any).invoke(tc.args);
        results.push(new ToolMessage({ content: String(result), tool_call_id: tc.id! }));
      } catch (err) {
        if (err instanceof ConfirmationRequiredError) {
          // Persist the pending call so the confirmation endpoints can find it
          // by id, then short-circuit the graph. Crucially: we do NOT append a
          // ToolMessage with a "waiting for approval" string — there's nothing
          // for the model to reason about, and that's precisely what prevents
          // the confirmation loop described in the brief.
          const record = await createToolCall(
            db,
            sessionId,
            err.toolName,
            err.args,
            true
          );
          return {
            pendingConfirmation: {
              toolCallId: record.id,
              toolName: err.toolName,
              args: err.args,
              summary: err.summary,
            },
          };
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push(
          new ToolMessage({
            content: JSON.stringify({ error: errMsg }),
            tool_call_id: tc.id!,
          })
        );
      }
    }
    return { messages: results };
  }

  function shouldContinueAfterAgent(state: typeof GraphState.State): string {
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg instanceof AIMessage && lastMsg.tool_calls?.length) {
      const iterations = state.messages.filter(
        (m) => m instanceof AIMessage && (m as AIMessage).tool_calls?.length
      ).length;
      if (iterations >= MAX_TOOL_ITERATIONS) return "end";
      return "tools";
    }
    return "end";
  }

  function shouldContinueAfterTools(state: typeof GraphState.State): string {
    // Structured halt: if any tool in this turn asked for confirmation, we end
    // the run right here and let the API layer surface the pending state to
    // the user. No more model calls this turn.
    if (state.pendingConfirmation) return "end";
    return "agent";
  }

  const graph = new StateGraph(GraphState)
    .addNode("agent", agentNode)
    .addNode("tools", toolExecutorNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinueAfterAgent, {
      tools: "tools",
      end: "__end__",
    })
    .addConditionalEdges("tools", shouldContinueAfterTools, {
      agent: "agent",
      end: "__end__",
    });

  const checkpointer = new MemorySaver();
  const app = graph.compile({ checkpointer });

  const initialMessages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...priorMessages,
    new HumanMessage(message),
  ];

  const finalState = await app.invoke(
    { messages: initialMessages, sessionId, userId, systemPrompt, pendingConfirmation: null },
    { configurable: { thread_id: sessionId } }
  );

  const pending = (finalState.pendingConfirmation ?? null) as PendingConfirmation | null;

  if (pending) {
    // Don't persist any assistant text for a pending turn: the UI owns the
    // approval prompt and we want the transcript to reflect what actually
    // happened.
    return { response: null, toolCalls: toolCallNames, pendingConfirmation: pending };
  }

  const lastMessage = finalState.messages[finalState.messages.length - 1];
  const responseText =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

  await addMessage(db, sessionId, "assistant", responseText);

  return { response: responseText, toolCalls: toolCallNames, pendingConfirmation: null };
}
