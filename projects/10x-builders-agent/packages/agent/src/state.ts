import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

// `messagesStateReducer` (oficial de @langchain/langgraph) habilita que
// `compaction_node` reduzca el historial: dedupe por id y procesa
// RemoveMessage. Sin él, devolver un array más corto solo concatenaría.
export const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  sessionId: Annotation<string>(),
  userId: Annotation<string>(),
  systemPrompt: Annotation<string>(),
  compactionFailures: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
});

export type GraphStateType = typeof GraphState.State;
