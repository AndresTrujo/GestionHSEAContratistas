"use client";

import { useCallback, useState, type ReactNode } from "react";
import { secondaryButtonClass } from "@/components/administracion/estilos";
import { get_jsa_selected_risk_ids, get_jsa_steps, jsaHazards, jsaInitialSteps, jsaMaxSteps } from "@/config/jsa";
import type { WorkPermit } from "@/domain/permisos";
import { SectionCard } from "./SectionCard";
import { JsaStepFields } from "./JsaStepFields";

/** Valor por omisión estable (un arreglo nuevo en cada render rompería el memo de los pasos). */
const noHazards: string[] = [];

/**
 * Análisis del trabajo (pasos) y lista de peligros y riesgos. Los dos comparten estado: los peligros elegidos en
 * cualquier paso se marcan solos en la lista, y al llenar todos los pasos se pueden agregar más.
 */
export function JsaAnalysis({ legend, initialPermit }: { legend: ReactNode; initialPermit?: WorkPermit | null }) {
  const initialSteps = initialPermit ? get_jsa_steps(initialPermit) : [];
  const initialStepCount = Math.max(jsaInitialSteps, initialSteps.length);
  const initialStepHazards = Object.fromEntries(initialSteps.map((step) => [step.number, step.hazards.split(/[,\\s]+/).filter(Boolean)]));
  const risksFromSteps = new Set(initialSteps.flatMap((step) => step.hazards.split(/[,\\s]+/).filter(Boolean)));
  const initialRisks = initialPermit ? get_jsa_selected_risk_ids(initialPermit) : [];
  const [stepCount, set_step_count] = useState(initialStepCount);
  const [filledSteps, set_filled_steps] = useState<Record<number, boolean>>(
    Object.fromEntries(initialSteps.map((step) => [step.number, Boolean(step.description.trim())])),
  );
  const [stepHazards, set_step_hazards] = useState<Record<number, string[]>>(initialStepHazards);
  const [manualRisks, set_manual_risks] = useState<string[]>(initialRisks.filter((risk) => !risksFromSteps.has(risk)));

  const stepRisks = new Set(Object.values(stepHazards).flat());
  const allFilled = Array.from({ length: stepCount }, (_, index) => filledSteps[index + 1] === true).every(Boolean);

  // Callbacks estables (solo usan setState funcional) para que los pasos memoizados no se rendericen de más.
  const handle_hazards_change = useCallback((row: number, hazards: string[]) => {
    set_step_hazards((current) => ({ ...current, [row]: hazards }));
  }, []);

  const handle_description_change = useCallback((row: number, filled: boolean) => {
    set_filled_steps((current) => (current[row] === filled ? current : { ...current, [row]: filled }));
  }, []);

  function toggle_manual_risk(id: string) {
    // Un riesgo marcado por algún paso no se desmarca a mano: primero hay que quitarlo de los pasos.
    if (stepRisks.has(id)) return;
    set_manual_risks((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <>
      <SectionCard
        step={3}
        title="Análisis del trabajo"
        description={`Divide la tarea en pasos secuenciales hasta su conclusión (el formato trae ${jsaInitialSteps}; al llenarlos todos puedes agregar más). En "N° de peligro" elige los riesgos que aplican al paso: se marcan solos en la lista de peligros de abajo. Riesgo = P × S. Deja vacías las filas que no uses.`}
      >
        <div className="space-y-3">
          {Array.from({ length: stepCount }, (_, index) => (
            <JsaStepFields
              key={index}
              row={index + 1}
              hazards={stepHazards[index + 1] ?? noHazards}
              initialStep={initialSteps[index] ? { description: initialSteps[index].description, controls: initialSteps[index].controls, probability: initialSteps[index].probability, severity: initialSteps[index].severity } : undefined}
              on_hazards_change={handle_hazards_change}
              on_description_change={handle_description_change}
            />
          ))}
        </div>
        {allFilled && stepCount < jsaMaxSteps && (
          <button
            type="button"
            onClick={() => set_step_count((current) => Math.min(current + 1, jsaMaxSteps))}
            className={`${secondaryButtonClass} mt-4`}
          >
            + Agregar paso adicional
          </button>
        )}
        {stepCount >= jsaMaxSteps && (
          <p className="mt-3 text-sm text-neutral-dark">Se alcanzó el máximo de {jsaMaxSteps} pasos.</p>
        )}
        {legend}
      </SectionCard>

      <SectionCard
        step={4}
        title="Peligros y riesgos relacionados con el trabajo"
        description="Los peligros elegidos en los pasos se marcan automáticamente; marca aquí cualquier otro que aplique al trabajo."
      >
        <div className="max-h-[32rem] space-y-4 overflow-y-auto rounded-xl border border-neutral-light p-4" tabIndex={0} role="group" aria-label="Lista de peligros y riesgos">
          {jsaHazards.map((hazard) => (
            <div key={hazard.number} className="text-sm">
              <h3 className="font-bold text-brand-navy">
                {hazard.number}. {hazard.name}
              </h3>
              {hazard.risks.map((risk) => {
                const fromStep = stepRisks.has(risk.id);
                return (
                  <label key={risk.id} className="ml-4 flex min-h-11 items-start gap-2 py-2 sm:min-h-10 sm:py-1.5">
                    <input
                      type="checkbox"
                      name="risks"
                      value={risk.id}
                      checked={fromStep || manualRisks.includes(risk.id)}
                      onChange={() => toggle_manual_risk(risk.id)}
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span>
                      <strong>{risk.id}</strong> {risk.text}
                      {fromStep && <em className="ml-1 text-xs text-neutral-dark">(elegido en un paso)</em>}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
