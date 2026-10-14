import type { ReactNode } from "react";

interface DisclosureCardProps {
  title: string;
  description?: string;
  /** Estado o resumen que se ve aun con la tarjeta cerrada. */
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Tarjeta que se despliega: deja a la vista el título y un resumen, y guarda el detalle hasta que se necesita. */
export function DisclosureCard({ title, description, badge, defaultOpen = false, children }: DisclosureCardProps) {
  return (
    <details open={defaultOpen} className="group mb-6 rounded-xl border border-neutral-light bg-white shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 hover:bg-neutral-light/15 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="text-xl uppercase leading-tight">{title}</h2>
          {description && <p className="text-sm text-neutral-dark">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {badge}
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
            className="text-neutral-dark transition group-open:rotate-180 motion-reduce:transition-none"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </summary>
      <div className="border-t border-neutral-light px-5 py-5">{children}</div>
    </details>
  );
}
