"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { initialActionState, type ActionState } from "@/lib/administracion/estado";
import { dangerButtonClass, primaryButtonClass, secondaryButtonClass } from "./estilos";

interface AdminFormProps {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  variant?: "primary" | "danger" | "secondary";
  className?: string;
  children: ReactNode;
}

const buttonClassByVariant = {
  primary: primaryButtonClass,
  danger: dangerButtonClass,
  secondary: secondaryButtonClass,
} as const;

/** Modal con el usuario y la contraseña de la cuenta administradora recién creada (se muestran una sola vez). */
function AdminAccountDialog({ account }: { account: NonNullable<ActionState["adminAccount"]> }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="admin-account-title"
      onCancel={(event) => event.preventDefault()}
      onClose={() => router.refresh()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg p-6 shadow-lg backdrop:bg-brand-navy/60"
    >
      <h2 id="admin-account-title" className="mb-1 text-2xl uppercase text-brand-navy">Cuenta creada</h2>
      <p className="mb-4 text-sm text-neutral-dark">
        Se creó la cuenta administradora de <strong>{account.providerName}</strong> para {account.name}.
      </p>
      <dl className="space-y-2 rounded border border-brand-cyan bg-neutral-light px-3 py-3 text-sm">
        <div>
          <dt className="text-xs font-bold text-neutral-dark">Usuario</dt>
          <dd><code className="text-lg font-bold text-brand-navy">{account.username}</code></dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-neutral-dark">Contraseña temporal</dt>
          <dd><code className="text-lg font-bold text-brand-navy">{account.password}</code></dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-neutral-dark">
        Se muestran una sola vez: anótalas y entrégalas al responsable. Deberá cambiar su contraseña al entrar.
      </p>
      <button type="button" onClick={() => dialogRef.current?.close()} className={`mt-4 ${primaryButtonClass}`}>
        Entendido, ya las anoté
      </button>
    </dialog>
  );
}

/**
 * Formulario que ejecuta una acción de servidor y muestra su resultado en el mismo lugar.
 * Los mensajes (y datos de un solo uso, como una contraseña temporal) viajan en el estado,
 * no en la URL.
 */
export function AdminForm({
  action,
  submitLabel,
  variant = "primary",
  className,
  children,
}: AdminFormProps) {
  const [state, form_action, pending] = useActionState(action, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);

  // React 19 limpia el formulario tras cada envío; se evita para no perder lo escrito cuando hay un error,
  // y solo se limpia cuando la acción salió bien.
  function handle_submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => form_action(formData));
  }

  useEffect(() => {
    if (state.ok === true) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} onSubmit={handle_submit} className={className}>
      {children}
      <button type="submit" disabled={pending} className={`mt-3 ${buttonClassByVariant[variant]}`}>
        {pending ? "Procesando…" : submitLabel}
      </button>
      {state.ok !== null && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
            state.ok ? "bg-brand-green/10 text-green-900" : "bg-red-50 text-red-900"
          }`}
        >
          <span aria-hidden="true">{state.ok ? "✓" : "✕"}</span>
          <span>{state.message}</span>
        </p>
      )}
      {state.credentials && state.credentials.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded border border-brand-cyan bg-neutral-light px-3 py-2 text-sm">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="pr-4">Colaborador</th>
                <th className="pr-4">Usuario</th>
                <th>Contraseña temporal</th>
              </tr>
            </thead>
            <tbody>
              {state.credentials.map((item) => (
                <tr key={item.username}>
                  <td className="pr-4">{item.name}</td>
                  <td className="pr-4"><code className="font-bold text-brand-navy">{item.username}</code></td>
                  <td><code className="font-bold text-brand-navy">{item.password}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className="block text-xs text-neutral-dark">
            Se muestran una sola vez: anótalas y entrégalas a cada persona. Deberán cambiar su contraseña al entrar.
          </span>
        </div>
      )}
      {state.adminAccount && <AdminAccountDialog account={state.adminAccount} />}
      {state.secret && (
        <p className="mt-2 rounded border border-brand-cyan bg-neutral-light px-3 py-2 text-sm">
          Contraseña temporal:{" "}
          <code className="font-bold text-brand-navy">{state.secret}</code>
          <span className="block text-xs text-neutral-dark">
            Se muestra una sola vez: anótala y entrégala a la persona. Deberá cambiarla al entrar.
          </span>
        </p>
      )}
    </form>
  );
}
