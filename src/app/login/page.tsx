import Link from "next/link";
import { login_employee_action, login_provider_action } from "@/lib/auth/acciones";
import { format_wait } from "@/lib/auth/limite_intentos";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; tipo?: string; espera?: string }>;
}

const errorMessages: Record<string, string> = {
  required: "Completa todos los campos.",
  invalid_employee: "El número de empleado no es válido o el empleado está inactivo.",
  invalid_credentials: "Usuario o contraseña incorrectos.",
  locked: "Cuenta bloqueada por intentos fallidos. Intenta de nuevo en unos minutos.",
  inactive: "Tu cuenta está inactiva. Contacta a HSEA.",
  suspended: "Tu empresa está suspendida. Contacta a HSEA.",
};

const inputClass =
  "mb-4 min-h-11 w-full rounded-lg border border-neutral-dark/60 bg-white px-3 py-2 text-base text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-cyan";
const labelClass = "mb-1 block text-sm font-bold text-brand-navy";
const submitClass =
  "mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-green px-4 py-2 font-bold text-white shadow-sm transition hover:brightness-95";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, tipo, espera } = await searchParams;
  const isProvider = tipo === "proveedor";
  const waitSeconds = Number(espera);
  const errorMessage =
    error === "throttled"
      ? `Demasiados intentos fallidos. Intenta de nuevo en ${format_wait(Number.isFinite(waitSeconds) && waitSeconds > 0 ? waitSeconds : 60)}.`
      : error
        ? errorMessages[error]
        : undefined;

  const get_tab_class = (active: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-center text-sm font-bold transition ${
      active
        ? "bg-white text-brand-navy shadow-sm"
        : "text-neutral-dark hover:text-brand-navy"
    }`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-navy px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-neutral-dark">Plataforma HSEA</p>
        <h1 className="mb-6 text-3xl uppercase leading-tight text-brand-navy">
          Gestión HSEA <span className="text-brand-green">Contratistas</span>
        </h1>

        <nav aria-label="Tipo de acceso" className="mb-6 flex gap-1 rounded-lg bg-neutral-light/40 p-1">
          <Link href="/login" aria-current={!isProvider ? "page" : undefined} className={get_tab_class(!isProvider)}>
            Empleado TFS
          </Link>
          <Link href="/login?tipo=proveedor" aria-current={isProvider ? "page" : undefined} className={get_tab_class(isProvider)}>
            Proveedor
          </Link>
        </nav>

        {errorMessage && (
          <p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errorMessage}
          </p>
        )}

        {isProvider ? (
          <form action={login_provider_action}>
            <label htmlFor="username" className={labelClass}>
              Usuario
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              maxLength={8}
              className={inputClass}
            />
            <label htmlFor="password" className={labelClass}>
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className={inputClass}
            />
            <button
              type="submit"
              className={submitClass}
            >
              Entrar
            </button>
          </form>
        ) : (
          <form action={login_employee_action}>
            <label htmlFor="employeeNumber" className={labelClass}>
              Número de empleado
            </label>
            <input
              id="employeeNumber"
              name="employeeNumber"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              autoFocus
              className={inputClass}
            />
            <button
              type="submit"
              className={submitClass}
            >
              Entrar
            </button>
          </form>
        )}

        {isProvider && (
          <p className="mt-4 text-center text-sm">
            <Link href="/registro-proveedor" className="text-neutral-dark underline hover:text-brand-navy">
              Mi empresa aún no está registrada
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
