import type { PermitStatus } from "@/domain/permisos";

/** El texto y un símbolo acompañan al color para no depender solo de él. */
const statusStyles: Record<PermitStatus, { label: string; symbol: string; className: string }> = {
  draft: { label: "Borrador", symbol: "✎", className: "bg-neutral-light/30 text-brand-navy ring-neutral-dark/50" },
  submitted: { label: "Pendiente de firmas", symbol: "…", className: "bg-cyan-50 text-brand-navy ring-brand-cyan" },
  approved: { label: "Autorizado", symbol: "✓", className: "bg-green-50 text-green-900 ring-brand-green" },
  rejected: { label: "Rechazado", symbol: "✕", className: "bg-red-50 text-red-800 ring-red-300" },
  closed: { label: "Cerrado", symbol: "■", className: "bg-brand-navy text-white ring-brand-navy" },
};

export function PermitStatusBadge({ status }: { status: PermitStatus }) {
  const style = statusStyles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${style.className}`}>
      <span aria-hidden="true">{style.symbol}</span>
      {style.label}
    </span>
  );
}
