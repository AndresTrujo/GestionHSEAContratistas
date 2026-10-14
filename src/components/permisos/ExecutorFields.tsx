"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import type { ExecutorFormOptions } from "@/lib/permisos/ejecutantes";
import { TfsEmployeePicker } from "./TfsEmployeePicker";
// Solo tipos: el módulo del servidor no se empaqueta en el cliente.

interface ExecutorFieldsProps {
  options: ExecutorFormOptions;
  maxExecutors: number;
  /** Tipo de trabajo del permiso (código); muestra cuáles colaboradores lo tienen declarado. */
  requiredWorkType: string | null;
}

const semaphoreLabels = { VERDE: "verde", AMARILLO: "amarillo", ROJO: "rojo" } as const;

/**
 * Ejecutantes del permiso (el título lo pone la tarjeta que lo contiene). Personal TFS: nombres escritos. Contratista:
 * se eligen de los colaboradores del proveedor y solo se pueden elegir los que están en semáforo verde (el servidor
 * lo vuelve a validar).
 */
export function ExecutorFields({ options, maxExecutors, requiredWorkType }: ExecutorFieldsProps) {
  const [providerId, set_provider_id] = useState(options.fixedProviderId === null ? "" : String(options.fixedProviderId));
  const provider = options.providers.find((item) => String(item.id) === providerId);
  const isFixed = options.fixedProviderId !== null;

  return (
    <div>
      {isFixed ? (
        <input type="hidden" name="providerId" value={providerId} />
      ) : (
        <div className="mb-4">
          <label htmlFor="providerId" className={labelClass}>¿Lo ejecuta un contratista?</label>
          <select id="providerId" name="providerId" value={providerId} onChange={(event) => set_provider_id(event.target.value)} className={inputClass}>
            <option value="">No, personal TFS (búscalo por nombre o número)</option>
            {options.providers.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: maxExecutors }, (_, index) => {
          const position = index + 1;
          const hint = `Ejecutante ${position}${position === 1 ? " (obligatorio)" : ""}`;
          if (!provider) {
            return (
              <div key={position}>
                <label htmlFor={`executor${position}`} className={labelClass}>{hint}</label>
                <TfsEmployeePicker id={`executor${position}`} name={`executorTfs${position}`} required={position === 1} />
              </div>
            );
          }
          return (
            <div key={`${provider.id}-${position}`}>
              <label htmlFor={`executorEmployee${position}`} className={labelClass}>{hint}</label>
              <select id={`executorEmployee${position}`} name={`executorEmployee${position}`} defaultValue="" className={inputClass}>
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
      {provider && (
        <p className="mt-3 text-xs text-neutral-dark">
          Solo se pueden elegir colaboradores con semáforo verde{requiredWorkType ? " y con este tipo de trabajo declarado (su DC-3 aprobado)" : ""}.
        </p>
      )}
    </div>
  );
}
