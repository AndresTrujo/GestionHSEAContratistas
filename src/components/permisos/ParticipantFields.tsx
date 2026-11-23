"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import type { ExecutorFormOptions } from "@/lib/permisos/ejecutantes";
import { TfsEmployeePicker } from "./TfsEmployeePicker";

interface ParticipantFieldsProps {
  options: ExecutorFormOptions;
  maxParticipants: number;
  startPosition?: number;
  initialProviderId?: string | null;
  requireParticipant?: boolean;
}

/** Muestra seis participantes inicialmente y agrega dos espacios al completar todos los visibles. */
export function ParticipantFields({ options, maxParticipants, startPosition = 0, initialProviderId = null, requireParticipant = true }: ParticipantFieldsProps) {
  const initialProvider = options.fixedProviderId === null ? (initialProviderId ?? "") : String(options.fixedProviderId);
  const [providerId, set_provider_id] = useState(initialProvider);
  const [visibleCount, set_visible_count] = useState(Math.min(maxParticipants, 100 - startPosition));
  const [filled, set_filled] = useState<Record<number, boolean>>({});
  const provider = options.providers.find((item) => String(item.id) === providerId);
  const isFixed = options.fixedProviderId !== null;

  function update_position(position: number, value: string) {
    const next = { ...filled, [position]: Boolean(value) };
    set_filled(next);
    if (Array.from({ length: visibleCount }, (_, index) => startPosition + index + 1).every((item) => next[item])) {
      set_visible_count((count) => Math.min(count + 2, 100 - startPosition));
    }
  }

  return (
    <div>
      <input type="hidden" name="participantCount" value={startPosition + visibleCount} />
      {isFixed ? (
        <input type="hidden" name="providerId" value={providerId} />
      ) : (
        <label className="mb-4 block max-w-xl">
          <span className={labelClass}>¿Participan colaboradores de un contratista?</span>
          <select name="providerId" value={providerId} onChange={(event) => { set_provider_id(event.target.value); set_filled({}); }} className={inputClass}>
            <option value="">No (personal TFS)</option>
            {options.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: visibleCount }, (_, index) => {
          const position = startPosition + index + 1;
          const label = `Participante ${position}${requireParticipant && index === 0 ? " (obligatorio)" : ""}`;
          return (
            <label key={`${providerId}-${position}`} className="block">
              <span className={labelClass}>{label}</span>
              {provider ? (
                <select name={`participantStaff${position}`} defaultValue="" required={requireParticipant && index === 0} onChange={(event) => update_position(position, event.target.value)} className={inputClass}>
                  <option value="">Elige un colaborador de {provider.name}</option>
                  {provider.staff.map((member) => (
                    <option key={member.id} value={member.id} disabled={member.semaphore !== "VERDE"}>
                      {member.name}
                      {member.semaphore !== "VERDE" ? ` — semáforo ${member.semaphore ? member.semaphore.toLowerCase() : "sin datos"}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <TfsEmployeePicker name={`participantEmployee${position}`} required={requireParticipant && index === 0} onValueChange={(value) => update_position(position, value)} />
              )}
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-neutral-dark">Al completar todos los espacios disponibles se agregarán automáticamente dos más. Máximo 100 participantes.</p>
    </div>
  );
}
