import type { ReactNode } from "react";

/** Aviso de error del formulario: recuadro rojo con símbolo (no depende solo del color) y role="alert". */
export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">
      <span aria-hidden="true" className="text-lg leading-none">✕</span>
      <span>{children}</span>
    </p>
  );
}
