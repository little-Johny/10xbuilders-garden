import { getEnv, EnvValidationError } from './config/env.js';
import { buildAgentExecutor } from './agent/createAgent.js';
import { startRepl } from './cli/repl.js';
import { SheetsFatalError, getUserMessage } from './sheets/errors.js';
import { renderFatalError } from './cli/formatters.js';
import { isDebugEnabled } from './cli/debug.js';

/**
 * Bootstraps the CLI: validates env, builds the agent once, and hands
 * control over to the REPL. Any startup failure is surfaced as a
 * Spanish, user-facing message; we never print stack traces.
 */
async function main() {
  try {
    getEnv();
    const executor = await buildAgentExecutor(isDebugEnabled());
    await startRepl({ executor });
  } catch (error) {
    const message = getUserMessage(error);
    process.stderr.write(`${renderFatalError(message)}\n`);
    if (error instanceof EnvValidationError || error instanceof SheetsFatalError) {
      process.exit(1);
    }
    process.exit(1);
  }
}

main();
