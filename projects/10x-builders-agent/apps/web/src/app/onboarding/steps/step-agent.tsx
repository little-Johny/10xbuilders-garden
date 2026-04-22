"use client";

import type { OnboardingData } from "../wizard";

interface Props {
  data: OnboardingData;
  onChange: (partial: Partial<OnboardingData>) => void;
}

export function StepAgent({ data, onChange }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Configura tu agente</h2>
        <p className="text-sm text-neutral-500">
          Dale un nombre e instrucciones a tu asistente.
        </p>
      </div>

      <div>
        <label htmlFor="agentName" className="block text-sm font-medium mb-1">
          Nombre del agente
        </label>
        <input
          id="agentName"
          type="text"
          value={data.agentName}
          onChange={(e) => onChange({ agentName: e.target.value })}
          placeholder="p. ej. Jarvis, Asistente, Bot"
          maxLength={50}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div>
        <label htmlFor="systemPrompt" className="block text-sm font-medium mb-1">
          Instrucciones del sistema
        </label>
        <p className="text-xs text-neutral-400 mb-2">
          Define el comportamiento y personalidad de tu agente. Máximo 500 caracteres.
        </p>
        <textarea
          id="systemPrompt"
          value={data.agentSystemPrompt}
          onChange={(e) =>
            onChange({ agentSystemPrompt: e.target.value.slice(0, 500) })
          }
          rows={5}
          maxLength={500}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <p className="mt-1 text-xs text-neutral-400 text-right">
          {data.agentSystemPrompt.length}/500
        </p>
      </div>
    </div>
  );
}
