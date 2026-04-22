import readline from 'node:readline';
import { runAgent } from '../agent/runAgent.js';
import { SheetsFatalError, getUserMessage } from '../sheets/errors.js';
import { EnvValidationError } from '../config/env.js';
import {
  renderFarewell,
  renderFatalError,
  renderRecoverableError,
  renderWelcome,
} from './formatters.js';

const EXIT_COMMANDS = new Set(['salir', 'exit']);

/**
 * @typedef {object} StartReplOptions
 * @property {import('../agent/runAgent.js').AgentInvoker} executor
 * @property {NodeJS.ReadableStream} [input]
 * @property {NodeJS.WritableStream} [output]
 * @property {(code?: number) => void} [exit]
 */

/**
 * Starts the interactive REPL. Returns when the user exits.
 *
 * @param {StartReplOptions} options
 * @returns {Promise<void>}
 */
export function startRepl({ executor, input = process.stdin, output = process.stdout, exit = process.exit }) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output, prompt: 'aisaac> ' });
    /** @type {Array<import('@langchain/core/messages').HumanMessage | import('@langchain/core/messages').AIMessage>} */
    let history = [];
    let processing = false;
    let closed = false;

    /** @param {string} line */
    const writeLine = (line) => {
      output.write(`${line}\n`);
    };

    const farewell = () => {
      if (closed) return;
      closed = true;
      writeLine(renderFarewell());
      rl.close();
    };

    /** @param {string} message */
    const handleFatal = (message) => {
      writeLine(renderFatalError(message));
      closed = true;
      rl.close();
      exit(1);
    };

    writeLine(renderWelcome());
    rl.prompt();

    rl.on('line', async (raw) => {
      if (processing) return;
      const line = raw.trim();
      if (line.length === 0) {
        rl.prompt();
        return;
      }
      if (EXIT_COMMANDS.has(line.toLowerCase())) {
        farewell();
        return;
      }
      processing = true;
      writeLine('Pensando...');
      try {
        const result = await runAgent(line, { executor, history });
        history = result.history;
        writeLine(result.output);
      } catch (error) {
        const message = getUserMessage(error);
        if (error instanceof SheetsFatalError || error instanceof EnvValidationError) {
          handleFatal(message);
          return;
        }
        writeLine(renderRecoverableError(message));
      } finally {
        processing = false;
        if (!closed) rl.prompt();
      }
    });

    rl.on('SIGINT', () => {
      farewell();
    });

    rl.on('close', () => {
      resolve();
    });
  });
}
