import type { PasswordCheck } from "@/lib/auth/password";

type Props = {
  checks: PasswordCheck[];
};

// Checklist visual de reglas de contraseña. Se muestra debajo del input de
// nueva contraseña en signup y reset-password; cada regla se enverdece a
// medida que el usuario cumple la condición.
export function PasswordRules({ checks }: Props) {
  return (
    <ul className="space-y-1 text-xs">
      {checks.map((check) => (
        <li
          key={check.id}
          className={
            check.ok
              ? "flex items-center gap-2 text-green-700 dark:text-green-400"
              : "flex items-center gap-2 text-neutral-500 dark:text-neutral-400"
          }
        >
          <span aria-hidden="true">{check.ok ? "✓" : "○"}</span>
          <span>{check.label}</span>
        </li>
      ))}
    </ul>
  );
}
