import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Ingresa a tu cuenta para acceder al agente.
          </p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-neutral-500">
          ¿No tienes cuenta?{" "}
          <a href="/signup" className="text-blue-600 hover:underline">
            Crear cuenta
          </a>
        </p>
      </div>
    </main>
  );
}
