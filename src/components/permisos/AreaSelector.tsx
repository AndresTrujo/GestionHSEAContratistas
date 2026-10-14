"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/administracion/estilos";

interface AreaOption {
  id: number;
  name: string;
}

interface AreaSelectorProps {
  departments: AreaOption[];
  subdepartments: (AreaOption & { departmentId: number })[];
}

/** Departamento (obligatorio) y subdepartamento (opcional, de ese departamento). */
export function AreaSelector({ departments, subdepartments }: AreaSelectorProps) {
  const [departmentId, set_department_id] = useState("");
  const options = subdepartments.filter((item) => String(item.departmentId) === departmentId);

  return (
    <>
      <div>
        <label htmlFor="departmentId" className={labelClass}>Departamento del área de trabajo</label>
        <select
          id="departmentId"
          name="departmentId"
          required
          value={departmentId}
          onChange={(event) => set_department_id(event.target.value)}
          className={inputClass}
        >
          <option value="">Elige…</option>
          {departments.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="subdepartmentId" className={labelClass}>Subdepartamento (si aplica)</label>
        <select id="subdepartmentId" name="subdepartmentId" defaultValue="" disabled={options.length === 0} className={`${inputClass} disabled:bg-neutral-light/20`} key={departmentId}>
          <option value="">Todo el departamento</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </div>
    </>
  );
}
