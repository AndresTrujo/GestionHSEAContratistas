"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import type { ExecutorFormOptions } from "@/lib/permisos/ejecutantes";
import { TfsEmployeePicker } from "./TfsEmployeePicker";

interface StopPeopleFieldsProps {
  options: ExecutorFormOptions;
}

type ObservedKind = "TFS" | "PROVEEDOR";

/**
 * Personas de la observación STOP: el observador y el supervisor siempre son empleados TFS (selector con buscador);
 * el observado puede ser un empleado TFS o un colaborador de un proveedor. El servidor vuelve a validar cada elección.
 */
export function StopPeopleFields({ options }: StopPeopleFieldsProps) {
  const [observedKind, set_observed_kind] = useState<ObservedKind>("TFS");
  const [providerId, set_provider_id] = useState("");
  const provider = options.providers.find((item) => String(item.id) === providerId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="observerEmployee" className={labelClass}>Observador (TFS)</label>
        <TfsEmployeePicker id="observerEmployee" name="observerEmployee" required />
      </div>
      <div>
        <label htmlFor="supervisorEmployee" className={labelClass}>Supervisor (TFS)</label>
        <TfsEmployeePicker id="supervisorEmployee" name="supervisorEmployee" required />
      </div>

      <fieldset className="sm:col-span-2">
        <legend className={labelClass}>Observado</legend>
        <input type="hidden" name="observedKind" value={observedKind} />
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              { value: "TFS", label: "Empleado TFS" },
              { value: "PROVEEDOR", label: "Colaborador de proveedor" },
            ] as const
          ).map((item) => (
            <label
              key={item.value}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 text-sm has-[:checked]:border-brand-navy has-[:checked]:bg-brand-navy has-[:checked]:text-white sm:min-h-10"
            >
              <input
                type="radio"
                name="observedKindChoice"
                value={item.value}
                checked={observedKind === item.value}
                onChange={() => set_observed_kind(item.value)}
                className="h-4 w-4"
              />
              {item.label}
            </label>
          ))}
        </div>

        {observedKind === "TFS" ? (
          <TfsEmployeePicker id="observedEmployee" name="observedEmployee" required />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="observedProviderId" className={labelClass}>Proveedor</label>
              <select
                id="observedProviderId"
                name="observedProviderId"
                required
                value={providerId}
                onChange={(event) => set_provider_id(event.target.value)}
                className={inputClass}
              >
                <option value="">Elige un proveedor</option>
                {options.providers.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="observedStaff" className={labelClass}>Colaborador</label>
              <select
                key={providerId}
                id="observedStaff"
                name="observedStaff"
                required
                defaultValue=""
                disabled={!provider}
                className={inputClass}
              >
                <option value="">{provider ? "Elige un colaborador" : "Primero elige un proveedor"}</option>
                {provider?.staff.map((member) => (
                  <option key={member.id} value={member.id} disabled={member.semaphore !== "VERDE"}>
                    {member.name}
                    {member.semaphore !== "VERDE" ? ` — semáforo ${member.semaphore ? member.semaphore.toLowerCase() : "sin datos"}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
