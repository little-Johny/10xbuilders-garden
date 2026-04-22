"use client";

import type { OnboardingData } from "../wizard";

interface Props {
  data: OnboardingData;
  onChange: (partial: Partial<OnboardingData>) => void;
}

const AVAILABLE_TOOLS = [
  {
    id: "get_user_preferences",
    name: "Preferencias del usuario",
    description: "Consulta tu configuración y preferencias.",
    risk: "low" as const,
    requiresIntegration: null,
  },
  {
    id: "list_enabled_tools",
    name: "Listar herramientas",
    description: "Muestra qué herramientas tienes habilitadas.",
    risk: "low" as const,
    requiresIntegration: null,
  },
  {
    id: "github_list_repos",
    name: "GitHub: listar repos",
    description: "Lista tus repositorios de GitHub.",
    risk: "low" as const,
    requiresIntegration: "github",
  },
  {
    id: "github_list_issues",
    name: "GitHub: listar issues",
    description: "Lista issues de un repositorio.",
    risk: "low" as const,
    requiresIntegration: "github",
  },
  {
    id: "github_create_issue",
    name: "GitHub: crear issue",
    description: "Crea un issue nuevo (requiere confirmación).",
    risk: "medium" as const,
    requiresIntegration: "github",
  },
];

const RISK_LABELS = {
  low: { text: "Bajo", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  medium: { text: "Medio", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  high: { text: "Alto", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

export function StepTools({ data, onChange }: Props) {
  function toggleTool(toolId: string) {
    const enabled = data.enabledTools.includes(toolId);
    onChange({
      enabledTools: enabled
        ? data.enabledTools.filter((id) => id !== toolId)
        : [...data.enabledTools, toolId],
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Herramientas</h2>
        <p className="text-sm text-neutral-500">
          Elige qué herramientas puede usar tu agente. Las de riesgo medio o
          alto pedirán confirmación antes de ejecutar.
        </p>
      </div>

      <div className="space-y-3">
        {AVAILABLE_TOOLS.map((tool) => {
          const risk = RISK_LABELS[tool.risk];
          const enabled = data.enabledTools.includes(tool.id);
          return (
            <label
              key={tool.id}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                enabled
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                  : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
              }`}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => toggleTool(tool.id)}
                className="mt-0.5 rounded border-neutral-300"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{tool.name}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${risk.color}`}>
                    {risk.text}
                  </span>
                  {tool.requiresIntegration && (
                    <span className="text-xs text-neutral-400">
                      requiere {tool.requiresIntegration}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {tool.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
