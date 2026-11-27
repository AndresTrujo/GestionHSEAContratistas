import Link from "next/link";
import type { ReactNode } from "react";

interface ModuleCardProps {
  title: string;
  description: string;
  href: string;
  /** Icono decorativo (se oculta a lectores de pantalla; el título ya describe la tarjeta). */
  icon?: ReactNode;
  /** Contador junto al título (p. ej. pendientes); no se muestra si es 0 o no se indica. */
  badge?: number;
}

export function ModuleCard({ title, description, href, icon, badge }: ModuleCardProps) {
  return (
    <Link
      href={href}
      className="group flex h-full items-start gap-4 rounded-xl border border-neutral-light bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-cyan hover:shadow-md motion-reduce:transform-none"
    >
      {icon && (
        <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-brand-cyan">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="mb-1 flex flex-wrap items-center gap-2 text-xl uppercase leading-tight text-brand-navy">
          {title}
          {badge !== undefined && badge > 0 && (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand-green px-2 py-0.5 font-sans text-xs font-bold normal-case text-white">
              {badge}
              <span className="sr-only"> pendientes</span>
            </span>
          )}
        </h2>
        <p className="text-sm text-neutral-dark">{description}</p>
      </div>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="mt-1 shrink-0 text-brand-cyan transition group-hover:translate-x-1 motion-reduce:transform-none"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}
