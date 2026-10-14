"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import type { ExecutorFormOptions } from "@/lib/permisos/ejecutantes";
import { TfsEmployeePicker } from "./TfsEmployeePicker";

interface ParticipantFieldsProps {
  options: ExecutorFormOptions;
  maxParticipants: number;
}

/**
 * Participantes del JSA. Si no participan colaboradores de un contratista, cada renglón es un selector de
 * empleados TFS; si participan, es un selector de los colaboradores de ese contratista (solo semáforo verde).
 * Al elegirlos sus datos salen de su registro y solo esa persona (o un usuario de su proveedor) firma por ellos.
 */
export function ParticipantFields({ options, maxParticipants }: ParticipantFieldsProps) {
  const [providerId, set_provider_id] = useState(options.fixedProviderId === null ? "" : String(options.fixedProviderId));
  const provider = options.providers.find((item) => String(item.id) === providerId);
  const isFixed = options.fixedProviderId !== null;

  return (
    <div>
      {isFixed ? (
        <input type="hidden" name="providerId" value={providerId} />
      ) : (
        <label className="mb-4 block max-w-xl">
          <span className={labelClass}>¿Participan colaboradores de un contratista?</span>
          <select name="providerId" value={providerId} onChange={(event) => set_provider_id(event.target.value)} className={inputClass}>
            <option value="">No (personal TFS)</option>
            {options.providers.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: maxParticipants }, (_, index) => {
          const position = index + 1;
          const label = `Participante ${position}${position === 1 ? " (obligatorio)" : ""}`;
          return (
            <label key={`${providerId}-${position}`} className="block">
              <span className={labelClass}>{label}</span>
              {provider ? (
                <select name={`participantStaff${position}`} defaultValue="" required={position === 1} className={inputClass}>
                  <option value="">Elige un colaborador de {provider.name}</option>
                  {provider.staff.map((member) => (
                    <option key={member.id} value={member.id} disabled={member.semaphore !== "VERDE"}>
                      {member.name}
                      {member.semaphore !== "VERDE" ? ` — semáforo ${member.semaphore ? member.semaphore.toLowerCase() : "sin datos"}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <TfsEmployeePicker name={`participantEmployee${position}`} required={position === 1} />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
