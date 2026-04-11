# Changelog

## 0.2.0 - 2026-04-09

- Added `flights` tool to search real flights via SerpApi Google Flights API.
- Upgraded `current_time` tool with optional `includeDate` parameter to return date and time (`YYYY-MM-DD HH:MM:SS`).
- Updated agent prompt with flight search instructions, relative date resolution, parameter inference, and assumption disclosure.
- Added comprehensive tests for the flights tool (11 cases) covering success, fallback, no results, API errors, and trip type.

## 0.1.1 - 2026-03-22

- Migrated provider configuration from OpenAI env keys to OpenRouter env keys.
- Updated model initialization to use OpenRouter base URL and optional `HTTP-Referer` / `X-Title` headers.
- Updated local environment template and documentation for OpenRouter setup.

## 0.1.0 - 2026-03-22

- Initial project setup with TypeScript ESM and npm.
- LangChain agent implementation using `createToolCallingAgent` and `AgentExecutor`.
- Included tools: `calculator` and `current_time`.
- CLI entry point to run questions from the terminal.
- Vitest tests for tools and runner.
- Initial documentation (`README.md` and `docs/architecture.md`).
- Local environment template in `env.local`.
