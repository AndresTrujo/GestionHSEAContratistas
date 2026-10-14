"use client";

import { useEffect, useState } from "react";
import { inputClass } from "@/components/administracion/estilos";
import { search_tfs_employees } from "@/lib/permisos/busqueda_empleados";
import type { TfsEmployeeOption } from "@/lib/permisos/ejecutantes";

interface TfsEmployeePickerProps {
  /** Nombre del campo enviado (número de empleado). */
  name: string;
  required?: boolean;
  /** Id del campo visible, para asociarlo con su etiqueta. */
  id?: string;
}

const iconButtonClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 transition sm:min-h-10 sm:min-w-10";
const minQueryLength = 2;
const debounceMs = 300;

/**
 * Selector de empleados TFS con buscador: la lupa abre un panel donde se busca por nombre o número de empleado.
 * La búsqueda se hace en el servidor (solo viajan las coincidencias) y envía el número elegido en un campo oculto.
 */
export function TfsEmployeePicker({ name, required = false, id }: TfsEmployeePickerProps) {
  const [open, set_open] = useState(false);
  const [query, set_query] = useState("");
  const [results, set_results] = useState<TfsEmployeeOption[]>([]);
  const [searching, set_searching] = useState(false);
  const [selected, set_selected] = useState<TfsEmployeeOption | null>(null);

  const term = query.trim();
  const canSearch = term.length >= minQueryLength;

  useEffect(() => {
    if (!canSearch) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      set_searching(true);
      try {
        const found = await search_tfs_employees(term);
        if (!cancelled) set_results(found);
      } catch {
        if (!cancelled) set_results([]);
      } finally {
        if (!cancelled) set_searching(false);
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, canSearch]);

  function choose(employee: TfsEmployeeOption | null) {
    set_selected(employee);
    set_open(false);
    set_query("");
    set_results([]);
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.employeeNumber ?? ""} />
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          required={required}
          value={selected ? `${selected.name} · ${selected.job} (${selected.employeeNumber})` : ""}
          placeholder="Elige un empleado TFS"
          onClick={() => set_open((current) => !current)}
          className={`${inputClass} cursor-pointer`}
        />
        {selected && (
          <button
            type="button"
            onClick={() => choose(null)}
            aria-label="Quitar empleado"
            className={`${iconButtonClass} border-neutral-dark/60 text-neutral-dark hover:bg-neutral-light/40`}
          >
            ×
          </button>
        )}
        <button
          type="button"
          onClick={() => set_open((current) => !current)}
          aria-label="Buscar empleado por nombre o número"
          aria-expanded={open}
          className={`${iconButtonClass} border-brand-navy text-brand-navy hover:bg-neutral-light/40`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          className="absolute left-0 z-20 mt-1 w-full min-w-72 rounded-xl border border-neutral-light bg-white p-2 shadow-lg"
          onKeyDown={(event) => {
            if (event.key === "Escape") set_open(false);
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(event) => set_query(event.target.value)}
            onKeyDown={(event) => {
              // Enter dentro del buscador no debe enviar el formulario.
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder="Buscar por nombre o número de empleado"
            aria-label="Buscar por nombre o número de empleado"
            className={inputClass}
          />
          <ul className="mt-2 max-h-60 overflow-y-auto text-sm">
            {!canSearch ? (
              <li className="px-2 py-2 text-neutral-dark">Escribe al menos {minQueryLength} caracteres.</li>
            ) : searching ? (
              <li className="px-2 py-2 text-neutral-dark">Buscando…</li>
            ) : results.length === 0 ? (
              <li className="px-2 py-2 text-neutral-dark">Sin resultados.</li>
            ) : (
              results.map((employee) => (
                <li key={employee.employeeNumber}>
                  <button
                    type="button"
                    onClick={() => choose(employee)}
                    className="block min-h-11 w-full rounded-lg px-2 py-1.5 text-left hover:bg-neutral-light/40 sm:min-h-10"
                  >
                    <span className="font-bold">{employee.name}</span>
                    <span className="block text-xs text-neutral-dark">
                      {employee.employeeNumber} · {employee.job} · {employee.department}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
