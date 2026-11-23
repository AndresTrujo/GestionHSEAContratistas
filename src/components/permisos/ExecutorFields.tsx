"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import type { ExecutorFormOptions } from "@/lib/permisos/ejecutantes";
import { TfsEmployeePicker } from "./TfsEmployeePicker";

interface ExecutorFieldsProps {
  options: ExecutorFormOptions;
  maxExecutors: number;
  requiredWorkType: string | null;
}

const semaphoreLabels = { VERDE: "verde", AMARILLO: "amarillo", ROJO: "rojo" } as const;

/** Muestra seis ejecutantes inicialmente y agrega dos espacios al completar todos los visibles. */
export function ExecutorFields({ options, maxExecutors, requiredWorkType }: ExecutorFieldsProps) {
  const [providerId, set_provider_id] = useState(options.fixedProviderId === null ? "" : String(options.fixedProviderId));
  const [visibleCount, set_visible_count] = useState(maxExecutors);
  const [filled, set_filled] = useState<Record<number, boolean>>({});
  const provider = options.providers.find((item) => String(item.id) === providerId);
  const isFixed = options.fixedProviderId !== null;

  function updatePosition(position: number, value: string) {
    const next = { ...filled, [position]: Boolean(value) };
    set_filled(next);
    if (Array.from({ length: visibleCount }, (_, index) => index + 1).every((item) => next[item])) {
      set_visible_count((count) => count + 2);
    }
  }

  return (
    <div>
      <input type="hidden" name="executorCount" value={visibleCount} />
      {isFixed ? (
        <input type="hidden" name="providerId" value={providerId} />
      ) : (
        <div className="mb-4">
          <label htmlFor="providerId" className={labelClass}>¿Lo ejecuta un contratista?</label>
          <select id="providerId" name="providerId" value={providerId} onChange={(event) => { set_provider_id(event.target.value); set_filled({}); }} className={inputClass}>
            <option value="">No, personal TFS (búscalo por nombre o número)</option>
            {options.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: visibleCount }, (_, index) => {
          const position = index + 1;
          const hint = `Ejecutante ${position}${position === 1 ? " (obligatorio)" : ""}`;
          if (!provider) {
            return (
              <div key={position}>
                <label htmlFor={`executor${position}`} className={labelClass}>{hint}</label>
                <TfsEmployeePicker id={`executor${position}`} name={`executorTfs${position}`} required={position === 1} onValueChange={(value) => updatePosition(position, value)} />
              </div>
            );
          }
          return (
            <div key={`${provider.id}-${position}`}>
              <label htmlFor={`executorEmployee${position}`} className={labelClass}>{hint}</label>
              <select id={`executorEmployee${position}`} name={`executorEmployee${position}`} defaultValue="" required={position === 1} onChange={(event) => updatePosition(position, event.target.value)} className={inputClass}>
                <option value="">Elige un colaborador</option>
                {provider.staff.map((member) => {
                  const isGreen = member.semaphore === "VERDE";
                  const lacksWorkType = requiredWorkType !== null && !member.workTypes.some((type) => type === requiredWorkType);
                  return (
                    <option key={member.id} value={member.id} disabled={!isGreen || lacksWorkType}>
                      {member.name}
                      {!isGreen ? ` — semáforo ${member.semaphore ? semaphoreLabels[member.semaphore] : "sin datos"}` : ""}
                      {isGreen && lacksWorkType ? " — sin este trabajo declarado" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-neutral-dark">Al completar todos los espacios disponibles se agregarán automáticamente dos más.</p>
      {provider && <p className="mt-1 text-xs text-neutral-dark">Solo se pueden elegir colaboradores con semáforo verde{requiredWorkType ? " y con este tipo de trabajo declarado (su DC-3 aprobado)" : ""}.</p>}
    </div>
  );
}
