"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { PasswordInput } from "@/components/password-input";
import { PasswordRules } from "@/components/password-rules";
import { validatePassword } from "@/lib/auth/password";

type Status = "checking" | "ready" | "expired";

export function ResetPasswordForm() {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { valid, checks } = validatePassword(password);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setStatus(user ? "ready" : "expired");
    });
    // El cliente se recrea por render; getUser sólo necesita ejecutarse al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!valid) {
      setError("La contraseña no cumple con todos los requisitos.");
      return;
    }

    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  if (status === "checking") {
    return (
      <p className="text-center text-sm text-neutral-500">Verificando enlace...</p>
    );
  }

  if (status === "expired") {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          Este enlace ya no es válido o expiró. Solicita uno nuevo.
        </div>
        <a
          href="/forgot-password"
          className="block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          Solicitar nuevo enlace
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}
      <PasswordInput
        id="password"
        label="Nueva contraseña"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
      />
      <PasswordRules checks={checks} />
      <PasswordInput
        id="confirm"
        label="Confirmar contraseña"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        required
      />
      <button
        type="submit"
        disabled={loading || !valid || password !== confirm}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Guardando..." : "Guardar contraseña"}
      </button>
    </form>
  );
}
