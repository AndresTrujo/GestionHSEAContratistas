import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Etiquetas o estados que van sobre el título. */
  eyebrow?: ReactNode;
  /** Acciones principales de la página (botones o enlaces). */
  actions?: ReactNode;
}

/** Encabezado de página: título, subtítulo, estados y acciones principales en una misma banda. */
export function PageHeader({ title, subtitle, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div>}
        <h1 className="text-4xl uppercase leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-neutral-dark">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
