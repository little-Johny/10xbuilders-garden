"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { StepProfile } from "./steps/step-profile";
import { StepAgent } from "./steps/step-agent";
import { StepTools } from "./steps/step-tools";
import { StepReview } from "./steps/step-review";

interface Props {
  userId: string;
  initialProfile: Record<string, unknown> | null;
  initialToolSettings: Array<{ tool_id: string; enabled: boolean }>;
}

export interface OnboardingData {
  name: string;
  timezone: string;
  language: string;
  agentName: string;
  agentSystemPrompt: string;
  enabledTools: string[];
}

const STEPS = ["Perfil", "Agente", "Herramientas", "Revisión"] as const;

export function OnboardingWizard({ userId, initialProfile, initialToolSettings }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    name: (initialProfile?.name as string) || "",
    timezone: (initialProfile?.timezone as string) || Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: (initialProfile?.language as string) || "es",
    agentName: (initialProfile?.agent_name as string) || "Agente",
    agentSystemPrompt:
      (initialProfile?.agent_system_prompt as string) ||
      "Eres un asistente útil que ayuda al usuario a gestionar tareas.",
    enabledTools: initialToolSettings
      .filter((t) => t.enabled)
      .map((t) => t.tool_id),
  });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  function updateData(partial: Partial<OnboardingData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  async function handleFinish() {
    setSaving(true);

    await supabase.from("profiles").upsert({
      id: userId,
      name: data.name,
      timezone: data.timezone,
      language: data.language,
      agent_name: data.agentName,
      agent_system_prompt: data.agentSystemPrompt,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    });

    const TOOL_IDS = [
      "get_user_preferences",
      "list_enabled_tools",
      "github_list_repos",
      "github_list_issues",
      "github_create_issue",
    ];

    for (const toolId of TOOL_IDS) {
      await supabase.from("user_tool_settings").upsert(
        {
          user_id: userId,
          tool_id: toolId,
          enabled: data.enabledTools.includes(toolId),
          config_json: {},
        },
        { onConflict: "user_id,tool_id" }
      );
    }

    router.push("/chat");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <nav className="flex items-center justify-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                i <= step
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {i + 1}
            </div>
            <span className="hidden text-sm sm:inline">{label}</span>
            {i < STEPS.length - 1 && (
              <div className="h-px w-6 bg-neutral-300 dark:bg-neutral-700" />
            )}
          </div>
        ))}
      </nav>

      {/* Step content */}
      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        {step === 0 && <StepProfile data={data} onChange={updateData} />}
        {step === 1 && <StepAgent data={data} onChange={updateData} />}
        {step === 2 && <StepTools data={data} onChange={updateData} />}
        {step === 3 && <StepReview data={data} />}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Anterior
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Siguiente
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={saving}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Finalizar y comenzar"}
          </button>
        )}
      </div>
    </div>
  );
}
