import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  description?: string;
  /** Número de paso (formularios largos): se muestra en un círculo junto al título. */
  step?: number;
  children: ReactNode;
}

/** Bloque de un formulario o de un detalle: tarjeta con título, descripción opcional y, si aplica, número de paso. */
export function SectionCard({ title, description, step, children }: SectionCardProps) {
  return (
    <section className="rounded-xl border border-neutral-light bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-start gap-3">
        {step !== undefined && (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy font-sans text-sm font-bold text-white"
          >
            {step}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-2xl uppercase leading-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-neutral-dark">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}
