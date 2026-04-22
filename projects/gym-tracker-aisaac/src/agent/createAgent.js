import { createToolCallingAgent, AgentExecutor } from 'langchain/agents';
import { createModel } from './model.js';
import { agentPrompt } from './prompt.js';
import { readHeadersTool } from './tools/readHeaders.js';
import { writeHeadersTool } from './tools/writeHeaders.js';
import { addColumnsTool } from './tools/addColumns.js';
import { appendRowTool } from './tools/appendRow.js';
import { readHistoryTool } from './tools/readHistory.js';

export const agentTools = [
  readHeadersTool,
  writeHeadersTool,
  addColumnsTool,
  appendRowTool,
  readHistoryTool,
];

/**
 * Builds the LangChain executor used by the REPL and tests.
 *
 * @param {boolean} [verbose]
 * @returns {Promise<AgentExecutor>}
 */
export async function buildAgentExecutor(verbose = false) {
  const llm = createModel();
  const agent = await createToolCallingAgent({
    llm,
    tools: agentTools,
    prompt: agentPrompt,
  });
  return new AgentExecutor({
    agent,
    tools: agentTools,
    verbose,
  });
}
