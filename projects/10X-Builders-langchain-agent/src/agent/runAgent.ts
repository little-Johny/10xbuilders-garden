import type { AgentExecutor } from "langchain/agents";
import { buildAgentExecutor } from "./createAgent.js";

type AgentInvoker = Pick<AgentExecutor, "invoke">;

export interface RunAgentOptions {
  executor?: AgentInvoker;
  verbose?: boolean;
}

export async function runAgent(
  input: string,
  options: RunAgentOptions = {}
): Promise<string> {
  const executor = options.executor ?? (await buildAgentExecutor(options.verbose));
  const result = await executor.invoke({ input });

  return String(result.output ?? "");
}
