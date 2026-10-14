"use client";

import { labelClass } from "@/components/administracion/estilos";
import { jsaHazards, jsaRiskIds } from "@/config/jsa";

interface HazardMultiSelectProps {
  /** Nombre del campo enviado (ids separados por coma). */
  name: string;
  value: string[];
  on_change: (value: string[]) => void;
}

/**
 * Selector múltiple de peligros/riesgos (ids "3.1", "27.1"…): se abre un panel con la lista agrupada por peligro y se
 * marcan los que apliquen al paso. Envía los ids como una cadena separada por comas.
 */
export function HazardMultiSelect({ name, value, on_change }: HazardMultiSelectProps) {
  function toggle(id: string) {
    const next = value.includes(id) ? value.filter((item) => item !== id) : [...value, id];
    on_change(next.sort((first, second) => jsaRiskIds.indexOf(first) - jsaRiskIds.indexOf(second)));
  }

  return (
    <div>
      <span aria-hidden="true" className={labelClass}>
        N° de peligro
      </span>
      <input type="hidden" name={name} value={value.join(", ")} />
      <details className="relative">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-lg border border-neutral-dark/60 bg-white px-3 py-2 text-sm text-brand-navy focus-visible:outline-2 focus-visible:outline-brand-navy sm:min-h-10">
          <span className="sr-only">N° de peligro: </span>
          {value.length === 0 ? <span className="text-neutral-dark">Elige uno o varios</span> : value.join(", ")}
        </summary>
        <div className="absolute left-0 z-20 mt-1 max-h-72 w-[min(28rem,90vw)] overflow-y-auto rounded-xl border border-neutral-light bg-white p-3 text-sm text-brand-navy shadow-lg">
          {jsaHazards.map((hazard) => (
            <div key={hazard.number} className="mb-2">
              <p className="font-bold">
                {hazard.number}. {hazard.name}
              </p>
              {hazard.risks.map((risk) => (
                <label key={risk.id} className="ml-3 flex min-h-11 items-start gap-2 py-2 sm:min-h-10 sm:py-1.5">
                  <input type="checkbox" checked={value.includes(risk.id)} onChange={() => toggle(risk.id)} className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>{risk.id}</strong> {risk.text}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
