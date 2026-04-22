"use client";

import type { OnboardingData } from "../wizard";

interface Props {
  data: OnboardingData;
}

export function StepReview({ data }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Revisión</h2>
        <p className="text-sm text-neutral-500">
          Confirma tu configuración antes de comenzar.
        </p>
      </div>

      <dl className="space-y-4 text-sm">
        <div>
          <dt className="font-medium text-neutral-400">Nombre</dt>
          <dd>{data.name || "(sin definir)"}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-400">Zona horaria</dt>
          <dd>{data.timezone}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-400">Idioma</dt>
          <dd>{data.language === "es" ? "Español" : "English"}</dd>
        </div>
        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <dt className="font-medium text-neutral-400">Nombre del agente</dt>
          <dd>{data.agentName}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-400">Instrucciones</dt>
          <dd className="whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs dark:bg-neutral-900">
            {data.agentSystemPrompt}
          </dd>
        </div>
        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <dt className="font-medium text-neutral-400">
            Herramientas habilitadas ({data.enabledTools.length})
          </dt>
          <dd>
            {data.enabledTools.length === 0 ? (
              <span className="text-neutral-400">Ninguna seleccionada</span>
            ) : (
              <ul className="mt-1 space-y-1">
                {data.enabledTools.map((id) => (
                  <li
                    key={id}
                    className="inline-block mr-2 mb-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {id}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
