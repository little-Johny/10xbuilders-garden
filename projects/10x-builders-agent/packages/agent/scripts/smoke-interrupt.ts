/**
 * Smoke test: confirm the exact shape of `app.invoke()`'s return value when a
 * node calls `interrupt()` and when the graph is later resumed via
 * `Command(resume)`. The runAgent detector logic must be based on what this
 * script logs, not on assumptions.
 *
 * Run with: npx tsx packages/agent/scripts/smoke-interrupt.ts
 *
 * Uses MemorySaver — no DB needed.
 */
import {
  Annotation,
  Command,
  MemorySaver,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";

const State = Annotation.Root({
  step: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "init",
  }),
  decision: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

async function maybeInterruptNode(
  state: typeof State.State,
): Promise<Partial<typeof State.State>> {
  console.log("[node] entering, step=", state.step);
  const decision = interrupt({
    kind: "approval_needed",
    detail: "do you approve?",
  });
  console.log("[node] resumed with decision=", decision);
  return { step: "after-interrupt", decision: String(decision) };
}

async function main() {
  const graph = new StateGraph(State)
    .addNode("maybe_interrupt", maybeInterruptNode)
    .addEdge("__start__", "maybe_interrupt")
    .addEdge("maybe_interrupt", "__end__");

  const checkpointer = new MemorySaver();
  const app = graph.compile({ checkpointer });

  const threadId = "smoke-thread-1";
  const config = { configurable: { thread_id: threadId } };

  console.log("\n=== first invoke (expect interrupt) ===");
  const first = await app.invoke({ step: "init", decision: null }, config);
  console.log("first result keys:", Object.keys(first));
  console.log("first result JSON:", JSON.stringify(first, null, 2));
  // Probe both candidate shapes:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyFirst = first as any;
  console.log("__interrupt__ present?", "__interrupt__" in anyFirst);
  console.log("tasks present?", "tasks" in anyFirst);

  console.log("\n=== state inspection while interrupted ===");
  const snap = await app.getState(config);
  console.log("snap.tasks:", JSON.stringify(snap.tasks, null, 2));
  console.log("snap.next:", JSON.stringify(snap.next, null, 2));
  console.log(
    "snap.tasks[0].interrupts:",
    JSON.stringify(snap.tasks?.[0]?.interrupts, null, 2),
  );

  console.log("\n=== resume with Command({ resume: 'approve' }) ===");
  const second = await app.invoke(new Command({ resume: "approve" }), config);
  console.log("second result keys:", Object.keys(second));
  console.log("second result JSON:", JSON.stringify(second, null, 2));
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
