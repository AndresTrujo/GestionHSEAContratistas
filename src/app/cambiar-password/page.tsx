import { redirect } from "next/navigation";
import { change_password_action, logout_action } from "@/lib/auth/acciones";
import { minPasswordLength } from "@/lib/auth/secreto";
import { get_session } from "@/lib/auth/sesion";

interface ChangePasswordPageProps {
  searchParams: Promise<{ error?: string }>;
}

const errorMessages: Record<string, string> = {
  short: `La contraseña nueva debe tener al menos ${minPasswordLength} caracteres.`,
  mismatch: "La confirmación no coincide con la contraseña nueva.",
  invalid: "No se pudo cambiar la contraseña: revisa que la actual sea correcta y que la nueva sea distinta.",
};

const inputClass =
  "mb-3 w-full rounded border border-neutral-light px-3 py-2 focus:border-brand-cyan focus:outline-none focus:ring-2 focus:ring-brand-cyan";
const labelClass = "mb-1 block text-sm font-bold text-brand-navy";

export default async function ChangePasswordPage({ searchParams }: ChangePasswordPageProps) {
  const session = await get_session();
  if (!session || session.kind !== "USUARIO_PROVEEDOR") redirect("/login?tipo=proveedor");

  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-3xl uppercase text-brand-navy">Cambiar contraseña</h1>
        <p className="mb-5 text-sm text-neutral-dark">
          {session.mustChangePassword
            ? "Tu contraseña es temporal: define una nueva para continuar."
            : "Define una contraseña nueva."}
        </p>

        {errorMessage && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <form action={change_password_action}>
          <label htmlFor="currentPassword" className={labelClass}>
            Contraseña actual
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            autoFocus
            className={inputClass}
          />
          <label htmlFor="newPassword" className={labelClass}>
            Contraseña nueva
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            className={inputClass}
          />
          <label htmlFor="confirmPassword" className={labelClass}>
            Confirmar contraseña nueva
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            className={inputClass}
          />
          <button
            type="submit"
            className="mt-2 w-full rounded bg-brand-green px-4 py-2 font-bold text-white hover:opacity-90"
          >
            Guardar contraseña
          </button>
        </form>

        <form action={logout_action} className="mt-4 text-center">
          <button type="submit" className="text-sm text-neutral-dark underline hover:text-brand-navy">
            Salir
          </button>
        </form>
      </div>
    </main>
  );
}
