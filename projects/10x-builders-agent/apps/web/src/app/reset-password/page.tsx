import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  // No redirige según sesión: la sesión de recovery ES una sesión válida.
  // El form valida con getUser() si el enlace sigue vigente.
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Nueva contraseña</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Elige una contraseña nueva para tu cuenta.
          </p>
        </div>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
