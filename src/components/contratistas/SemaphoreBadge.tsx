import type { Semaphore } from "@/domain/contratistas";

const semaphoreStyles: Record<Semaphore, { className: string; dotClassName: string; label: string }> = {
  ROJO: { className: "bg-red-50 text-red-800 ring-red-300", dotClassName: "bg-red-600", label: "Rojo" },
  AMARILLO: { className: "bg-yellow-50 text-yellow-900 ring-yellow-400", dotClassName: "bg-yellow-400", label: "Amarillo" },
  VERDE: { className: "bg-green-50 text-green-900 ring-brand-green", dotClassName: "bg-brand-green", label: "Verde" },
};

const semaphoreHelp: Record<Semaphore, string> = {
  ROJO: "Falta, está rechazado o venció algún requisito: no puede entrar a planta.",
  AMARILLO: "Todo cargado; pendiente de revisión y validación médica.",
  VERDE: "Documentación aprobada y vigente: puede entrar a planta.",
};

/** Semáforo del personal o equipo. El texto acompaña al color para no depender solo de él. */
export function SemaphoreBadge({ semaphore }: { semaphore: Semaphore | null }) {
  if (!semaphore) return <span className="text-xs text-neutral-dark">—</span>;
  const style = semaphoreStyles[semaphore];
  return (
    <span
      title={semaphoreHelp[semaphore]}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${style.className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${style.dotClassName}`} />
      {style.label}
    </span>
  );
}
