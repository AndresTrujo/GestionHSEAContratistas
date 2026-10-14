import type { ReactNode } from "react";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses: Record<BadgeTone, { className: string; symbol: string }> = {
  success: { className: "bg-brand-green/15 text-green-900", symbol: "✓" },
  warning: { className: "bg-amber-100 text-amber-900", symbol: "!" },
  danger: { className: "bg-red-100 text-red-900", symbol: "✕" },
  info: { className: "bg-brand-cyan/20 text-brand-navy", symbol: "i" },
  neutral: { className: "bg-neutral-light/50 text-brand-navy", symbol: "•" },
};

/** Etiqueta de estado: lleva un símbolo además del color para no depender solo de este. */
export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  const { className, symbol } = toneClasses[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${className}`}>
      <span aria-hidden="true">{symbol}</span>
      {children}
    </span>
  );
}
