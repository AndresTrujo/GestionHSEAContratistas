"use client";

import { useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { primaryButtonClass } from "@/components/administracion/estilos";
import type { PrivacyNoticeSection } from "@/config/aviso_privacidad";

interface PrivacyNoticeModalProps {
  title: string;
  version: string;
  sections: PrivacyNoticeSection[];
  action: (formData: FormData) => Promise<void>;
}

/**
 * Modal obligatorio del aviso de privacidad: no se cierra con Esc ni al hacer clic fuera. La casilla se habilita
 * al llegar al final del texto y "Continuar" al marcarla. Al aceptar, el servidor registra la evidencia y deja de mostrarlo.
 */
export function PrivacyNoticeModal({ title, version, sections, action }: PrivacyNoticeModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasReadAll, set_has_read_all] = useState(false);
  const [isAccepted, set_is_accepted] = useState(false);

  function check_scroll_end() {
    const element = scrollRef.current;
    if (!element) return;
    // Tolerancia de 4 px por redondeos de zoom; si el texto cabe sin scroll, cuenta como leído.
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 4) set_has_read_all(true);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    check_scroll_end();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="aviso-privacidad-titulo"
      onCancel={(event) => event.preventDefault()}
      className="m-auto w-[min(42rem,calc(100%-2rem))] rounded-2xl p-0 shadow-xl backdrop:bg-black/60"
    >
      <form action={action} className="flex max-h-[85vh] flex-col">
        <input type="hidden" name="noticeVersion" value={version} />
        <h2 id="aviso-privacidad-titulo" className="px-5 pb-2 pt-5 text-2xl uppercase text-brand-navy">
          {title}
        </h2>
        <div
          ref={scrollRef}
          onScroll={check_scroll_end}
          tabIndex={0}
          role="region"
          aria-label="Texto del aviso de privacidad"
          className="mx-5 min-h-40 flex-1 overflow-y-auto rounded-lg border border-neutral-light p-4 text-sm focus-visible:outline-2 focus-visible:outline-brand-cyan"
        >
          {sections.map((section) => (
            <section key={section.heading} className="mb-4">
              <h3 className="mb-1 text-base uppercase text-brand-navy">{section.heading}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mb-2">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
        <div className="space-y-3 p-5">
          {!hasReadAll && (
            <p className="text-xs text-neutral-dark">Desplázate hasta el final del aviso para poder aceptarlo.</p>
          )}
          <label className={`flex min-h-11 items-center gap-2 text-sm font-bold ${hasReadAll ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              name="accept"
              disabled={!hasReadAll}
              checked={isAccepted}
              onChange={(event) => set_is_accepted(event.target.checked)}
              className="size-5"
            />
            Sí, acepto el aviso de privacidad
          </label>
          <SubmitButton className={primaryButtonClass} disabled={!isAccepted}>
            Continuar
          </SubmitButton>
        </div>
      </form>
    </dialog>
  );
}
