# Architecture

This project implements an agent with LangChain tools using a modular structure designed for clarity, testability, and incremental extension.

## End-to-end flow

1. The CLI receives user `input` in `src/index.ts`.
2. `runAgent` in `src/agent/runAgent.ts` creates or receives an `AgentExecutor`.
3. `buildAgentExecutor` in `src/agent/createAgent.ts` composes model, prompt, and tools.
4. The agent selects and executes the appropriate tool based on the prompt:
   - `calculator`
   - `current_time`
5. `AgentExecutor` returns the final `output` to the caller.

## Module responsibilities

- `src/config/env.ts`
  - Loads `env.local`.
  - Validates environment variables with `zod`.
- `src/agent/model.ts`
  - Creates the `ChatOpenAI` model configured against OpenRouter.
- `src/agent/prompt.ts`
  - Defines the agent behavior and tool-usage instructions.
- `src/agent/tools/*`
  - Implements reusable domain tools.
- `src/agent/createAgent.ts`
  - Assembles model, tools, and prompt into the executable agent.
- `src/agent/runAgent.ts`
  - Exposes a focused execution interface for CLI and tests.

## Design decisions

- TypeScript ESM for alignment with the modern Node.js ecosystem.
- Centralized environment validation to fail fast on invalid configuration.
- OpenRouter is integrated through the OpenAI-compatible API surface with provider-specific headers.
- Injectable executor support in `runAgent` for isolated and fast unit tests.

## Recommended evolution

- Replace `Function(...)` in `calculator` with a safe parser/evaluator for production.
- Add new tools under `src/agent/tools` and register them in `createAgent.ts`.
- Add structured logging when deeper runtime diagnostics are required.
