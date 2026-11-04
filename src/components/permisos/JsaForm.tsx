"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  useTransition,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from "react";
import { primaryButtonClass } from "@/components/administracion/estilos";
import type { CertificationIssue } from "@/lib/permisos/certificaciones_jsa";

interface JsaFormProps {
  create_action: (formData: FormData) => Promise<void>;
  check_action: (formData: FormData) => Promise<CertificationIssue[]>;
  className?: string;
  children: ReactNode;
}

/** El formulario está revisando certificaciones o creando el JSA: el botón de envío se bloquea. */
const JsaBusyContext = createContext(false);

interface JsaSubmitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** Texto mientras el JSA se revisa y se crea. */
  pendingLabel?: string;
}

/**
 * Botón de envío del JSA. Equivale a SubmitButton, pero este formulario se envía con `onSubmit` (no con
 * `action`, porque React 19 limpiaría los campos al terminar una acción), así que `useFormStatus` no lo ve y
 * el estado de ocupado llega por contexto desde JsaForm.
 */
export function JsaSubmitButton({ pendingLabel, children, disabled, ...props }: JsaSubmitButtonProps) {
  const busy = useContext(JsaBusyContext);
  return (
    <button {...props} type="submit" disabled={disabled || busy} aria-busy={busy}>
      {busy && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/**
 * Formulario del JSA. Antes de crearlo revisa que los colaboradores de contratista tengan las certificaciones que exige
 * el trabajo; si faltan, muestra un aviso en un modal SIN enviar ni limpiar el formulario, para que se corrija en el lugar.
 * Mientras revisa y crea queda bloqueado (botón deshabilitado y candado contra Enter o doble clic): un segundo
 * envío crearía un JSA duplicado.
 */
export function JsaForm({ create_action, check_action, className, children }: JsaFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [issues, set_issues] = useState<CertificationIssue[]>([]);
  const [checking, set_checking] = useState(false);
  const [creating, start_creating] = useTransition();
  // El estado tarda un render en reflejarse; el candado es síncrono y frena un segundo envío inmediato.
  const submittingRef = useRef(false);
  const busy = checking || creating;

  async function handle_submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    const formData = new FormData(event.currentTarget);
    set_checking(true);
    try {
      const found = await check_action(formData);
      if (found.length > 0) {
        set_issues(found);
        dialogRef.current?.showModal();
        submittingRef.current = false;
        return;
      }
      // La creación redirige al terminar: el formulario sigue bloqueado hasta que cambie la página. Si falla,
      // se libera para poder corregir y reintentar.
      start_creating(async () => {
        try {
          await create_action(formData);
        } finally {
          submittingRef.current = false;
        }
      });
    } catch (error) {
      submittingRef.current = false;
      throw error;
    } finally {
      set_checking(false);
    }
  }

  return (
    <>
      <JsaBusyContext.Provider value={busy}>
        <form onSubmit={handle_submit} className={className} aria-busy={busy}>
          {children}
        </form>
      </JsaBusyContext.Provider>

      <dialog
        ref={dialogRef}
        aria-labelledby="jsa-cert-title"
        className="m-auto w-[min(32rem,92vw)] rounded-xl border border-neutral-light p-0 shadow-xl backdrop:bg-brand-navy/60"
      >
        <div className="p-6">
          <h2 id="jsa-cert-title" className="mb-2 text-2xl uppercase text-red-800">Certificaciones faltantes</h2>
          <p className="mb-3 text-sm">
            El trabajo requiere permiso y los siguientes colaboradores de contratista no tienen las certificaciones necesarias.
            Cambia al participante o pide al contratista que cargue y valide su documentación. No se perdió nada de lo capturado.
          </p>
          <ul className="mb-4 space-y-3 text-sm">
            {issues.map((issue) => (
              <li key={issue.name}>
                <strong>{issue.name}</strong>
                <ul className="ml-5 list-disc">
                  {issue.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={`${primaryButtonClass} bg-brand-navy! px-6`}
          >
            Entendido
          </button>
        </div>
      </dialog>
    </>
  );
}
