// Reglas de esquema de contraseña aplicadas en signup y reset-password.
// Mantener sincronizado con la política configurada en Supabase Dashboard
// (Authentication → Policies). El mínimo nativo de Supabase es 6; aquí lo
// elevamos a 8 + complejidad.

export type PasswordRule = {
  id: "length" | "upper" | "lower" | "number" | "special";
  label: string;
  test: (value: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: "Mínimo 8 caracteres",
    test: (v) => v.length >= 8,
  },
  {
    id: "upper",
    label: "Al menos una mayúscula (A-Z)",
    test: (v) => /[A-Z]/.test(v),
  },
  {
    id: "lower",
    label: "Al menos una minúscula (a-z)",
    test: (v) => /[a-z]/.test(v),
  },
  {
    id: "number",
    label: "Al menos un número (0-9)",
    test: (v) => /\d/.test(v),
  },
  {
    id: "special",
    label: "Al menos un carácter especial (!@#$…)",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

export type PasswordCheck = {
  id: PasswordRule["id"];
  label: string;
  ok: boolean;
};

export function validatePassword(value: string): {
  valid: boolean;
  checks: PasswordCheck[];
} {
  const checks = PASSWORD_RULES.map(({ id, label, test }) => ({
    id,
    label,
    ok: test(value),
  }));
  return { valid: checks.every((c) => c.ok), checks };
}
