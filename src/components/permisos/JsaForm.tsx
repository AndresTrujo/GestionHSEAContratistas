"use client";

import { startTransition, useRef, useState, type FormEvent, type ReactNode } from "react";
import { primaryButtonClass } from "@/components/administracion/estilos";
import type { CertificationIssue } from "@/lib/permisos/certificaciones_jsa";

interface JsaFormProps {
  create_action: (formData: FormData) => Promise<void>;
  check_action: (formData: FormData) => Promise<CertificationIssue[]>;
  className?: string;
  children: ReactNode;
}

/**
 * Formulario del JSA. Antes de crearlo revisa que los colaboradores de contratista tengan las certificaciones que exige
 * el trabajo; si faltan, muestra un aviso en un modal SIN enviar ni limpiar el formulario, para que se corrija en el lugar.
 */
export function JsaForm({ create_action, check_action, className, children }: JsaFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [issues, set_issues] = useState<CertificationIssue[]>([]);
  const [checking, set_checking] = useState(false);

  async function handle_submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    set_checking(true);
    try {
      const found = await check_action(formData);
      if (found.length > 0) {
        set_issues(found);
        dialogRef.current?.showModal();
        return;
      }
      startTransition(() => {
        void create_action(formData);
      });
    } finally {
      set_checking(false);
    }
  }

  return (
    <>
      <form onSubmit={handle_submit} className={className} aria-busy={checking}>
        {children}
      </form>

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
