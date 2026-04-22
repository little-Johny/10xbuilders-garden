import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { setupTestEnv, clearTestEnv } from './helpers/env.js';
import { runAgent } from '../src/agent/runAgent.js';

beforeEach(() => setupTestEnv());
afterEach(() => clearTestEnv());

describe('runAgent', () => {
  it('uses the injected executor and grows session history', async () => {
    const invoke = vi.fn(async ({ input }) => ({ output: `echo: ${input}` }));
    const executor = { invoke };
    const first = await runAgent('hola', { executor });
    expect(first.output).toBe('echo: hola');
    expect(first.history).toHaveLength(2);
    expect(first.history[0]).toBeInstanceOf(HumanMessage);
    expect(first.history[1]).toBeInstanceOf(AIMessage);
    const second = await runAgent('registrar press 60kg 10x4', {
      executor,
      history: first.history,
    });
    expect(second.history).toHaveLength(4);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][0].chat_history).toHaveLength(2);
  });

  it('enforces that the agent prompt starts with read_headers for new sessions', async () => {
    const { agentPrompt } = await import('../src/agent/prompt.js');
    const serialized = JSON.stringify(agentPrompt);
    expect(serialized).toMatch(/read_headers/);
    expect(serialized).toMatch(/ANTES|antes/);
  });

  it('enforces an anti-hallucination clause about tool outputs', async () => {
    const { agentPrompt } = await import('../src/agent/prompt.js');
    const serialized = JSON.stringify(agentPrompt);
    expect(serialized).toMatch(/NUNCA/);
    expect(serialized).toMatch(/ok/);
  });

  it('encodes out-of-scope refusal and safety rules in the prompt', async () => {
    const { agentPrompt } = await import('../src/agent/prompt.js');
    const serialized = JSON.stringify(agentPrompt);
    expect(serialized).toMatch(/rutinas|nutricion|lesion/i);
    expect(serialized).toMatch(/credenciales|APIs|entorno/i);
    expect(serialized).toMatch(/espa[ñn]ol/i);
  });
});
