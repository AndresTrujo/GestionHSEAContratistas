import type { ReactNode } from "react";

interface ProveedoresAccionDetalleProps {
  label: string;
  /** "danger" tiñe el botón de rojo para acciones destructivas. */
  tone?: "default" | "danger";
  children: ReactNode;
}

/** Acción que se despliega: el resumen se ve como botón (área táctil de 44 px) y el formulario aparece debajo. */
export function ProveedoresAccionDetalle({ label, tone = "default", children }: ProveedoresAccionDetalleProps) {
  const toneClass =
    tone === "danger"
      ? "border-red-700 text-red-700 hover:bg-red-50"
      : "border-neutral-dark/50 text-brand-navy hover:bg-neutral-light/40";
  return (
    <details className="group rounded-lg">
      <summary
        className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy motion-reduce:transition-none sm:min-h-10 [&::-webkit-details-marker]:hidden ${toneClass}`}
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="transition group-open:rotate-90 motion-reduce:transition-none"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        {label}
      </summary>
      <div className="mt-2 rounded-lg border border-neutral-light bg-neutral-light/15 p-3">{children}</div>
    </details>
  );
}
