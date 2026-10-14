"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import type { ExecutorFormOptions } from "@/lib/permisos/ejecutantes";

interface ContractorPickerProps {
  options: ExecutorFormOptions;
}

/**
 * Proveedor (compañía) y contratista que recibe la autorización: primero se elige el proveedor y luego uno de sus
 * colaboradores con semáforo verde. Un usuario de proveedor tiene su empresa fija.
 */
export function ContractorPicker({ options }: ContractorPickerProps) {
  const [providerId, set_provider_id] = useState(options.fixedProviderId === null ? "" : String(options.fixedProviderId));
  const provider = options.providers.find((item) => String(item.id) === providerId);
  const isFixed = options.fixedProviderId !== null;

  return (
    <>
      <div>
        <label htmlFor="providerId" className={labelClass}>Proveedor (compañía)</label>
        {isFixed ? (
          <>
            <input type="hidden" name="providerId" value={providerId} />
            <input id="providerId" readOnly value={provider?.name ?? ""} className={inputClass} />
          </>
        ) : (
          <select
            id="providerId"
            name="providerId"
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
        )}
      </div>
      <div>
        <label htmlFor="contractorStaff" className={labelClass}>Contratista (C.)</label>
        <select
          key={providerId}
          id="contractorStaff"
          name="contractorStaff"
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
        <p className="mt-1 text-xs text-neutral-dark">Solo se pueden elegir colaboradores con semáforo verde.</p>
      </div>
    </>
  );
}
