"use client";

import { memo, useState } from "react";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import { get_level_class, get_risk_level, jsaScale } from "@/config/jsa";
import { HazardMultiSelect } from "./HazardMultiSelect";

/** Sin fondo ni color de texto: los define el nivel elegido (evita conflictos entre bg-* y text-*). */
const selectBaseClass =
  "min-h-11 w-full rounded-lg border border-neutral-dark/60 px-3 py-2 text-base focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-cyan sm:min-h-10 sm:text-sm";

function ScaleSelect({
  name,
  label,
  value,
  on_change,
}: {
  name: string;
  label: string;
  value: number | null;
  on_change: (value: number | null) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-bold text-brand-navy">
        {label}
        <span className="sr-only">{label === "P" ? " (probabilidad)" : " (severidad)"}</span>
      </span>
      <select
        name={name}
        value={value ?? ""}
        onChange={(event) =>
          on_change(event.target.value ? Number(event.target.value) : null)
        }
        className={`${selectBaseClass} font-bold ${
          value ? get_level_class(value) : "bg-white text-brand-navy"
        }`}
      >
        <option value="">—</option>
        {jsaScale.map((level) => (
          <option key={level} value={level} className={get_level_class(level)}>
            {level}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Fila de un paso del JSA: calcula R = P × S y pinta el contenedor con el color del riesgo. */
function JsaStepFieldsBase({
  row,
  hazards,
  on_hazards_change,
  on_description_change,
}: {
  row: number;
  hazards: string[];
  on_hazards_change: (row: number, hazards: string[]) => void;
  on_description_change: (row: number, filled: boolean) => void;
}) {
  const [probability, set_probability] = useState<number | null>(null);
  const [severity, set_severity] = useState<number | null>(null);

  const risk = probability && severity ? probability * severity : null;
  const level = risk ? get_risk_level(risk) : null;

  return (
    <fieldset
      className={`rounded-xl border p-4 transition-colors ${
        level ? `border-transparent ${level.className}` : "border-neutral-light bg-white"
      }`}
    >
      <legend className="rounded-full bg-brand-navy px-3 py-0.5 text-sm font-bold text-white">Paso {row}</legend>
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr_2fr_11rem]">
        <div>
          <label htmlFor={`step${row}Description`} className={labelClass}>
            Paso del trabajo
          </label>
          <textarea
            id={`step${row}Description`}
            name={`step${row}Description`}
            rows={2}
            className={inputClass}
            onChange={(event) => on_description_change(row, event.target.value.trim().length > 0)}
          />
        </div>
        <HazardMultiSelect
          name={`step${row}Hazards`}
          value={hazards}
          on_change={(next) => on_hazards_change(row, next)}
        />
        <div>
          <label htmlFor={`step${row}Controls`} className={labelClass}>
            Medidas de control
          </label>
          <textarea id={`step${row}Controls`} name={`step${row}Controls`} rows={2} className={inputClass} />
        </div>
        <div>
          <p
            aria-live="polite"
            className="mb-2 rounded bg-white/90 px-2 py-1 text-center text-xs font-bold text-brand-navy"
          >
            {risk && level ? `Riesgo: ${risk} · ${level.label}` : "Riesgo: —"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ScaleSelect
              name={`step${row}P`}
              label="P"
              value={probability}
              on_change={set_probability}
            />
            <ScaleSelect
              name={`step${row}S`}
              label="S"
              value={severity}
              on_change={set_severity}
            />
          </div>
        </div>
      </div>
    </fieldset>
  );
}

/** Memoizado: al escribir en un paso, los demás no se vuelven a renderizar (sus props no cambian). */
export const JsaStepFields = memo(JsaStepFieldsBase);
