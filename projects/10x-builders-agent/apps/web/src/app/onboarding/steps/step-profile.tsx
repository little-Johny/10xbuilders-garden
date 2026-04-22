"use client";

import type { OnboardingData } from "../wizard";

interface Props {
  data: OnboardingData;
  onChange: (partial: Partial<OnboardingData>) => void;
}

const TIMEZONES = [
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "UTC",
];

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

export function StepProfile({ data, onChange }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Tu perfil</h2>
        <p className="text-sm text-neutral-500">
          Configura tu información básica.
        </p>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">
          Nombre
        </label>
        <input
          id="name"
          type="text"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Tu nombre"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium mb-1">
          Zona horaria
        </label>
        <select
          id="timezone"
          value={data.timezone}
          onChange={(e) => onChange({ timezone: e.target.value })}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="language" className="block text-sm font-medium mb-1">
          Idioma
        </label>
        <select
          id="language"
          value={data.language}
          onChange={(e) => onChange({ language: e.target.value })}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
