import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { buildAgentExecutor } from './createAgent.js';

/**
 * @typedef {object} AgentInvoker
 * @property {(input: { input: string, chat_history: Array<HumanMessage | AIMessage> }) => Promise<{ output?: unknown }>} invoke
 */

/**
 * @typedef {object} RunAgentOptions
 * @property {AgentInvoker} [executor]
 * @property {Array<HumanMessage | AIMessage>} [history]
 * @property {boolean} [verbose]
 */

/**
 * @typedef {object} RunAgentResult
 * @property {string} output
 * @property {Array<HumanMessage | AIMessage>} history
 */

/**
 * Runs a single conversational turn against the agent, preserving the
 * provided in-memory history. The session history is ephemeral and
 * lives only in process memory (brief: stateless across sessions).
 *
 * @param {string} input
 * @param {RunAgentOptions} [options]
 * @returns {Promise<RunAgentResult>}
 */
export async function runAgent(input, options = {}) {
  const executor = options.executor ?? (await buildAgentExecutor(options.verbose));
  const history = options.history ?? [];
  const result = await executor.invoke({ input, chat_history: history });
  const output = String(result.output ?? '');
  const nextHistory = [...history, new HumanMessage(input), new AIMessage(output)];
  return { output, history: nextHistory };
}
