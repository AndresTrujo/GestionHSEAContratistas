import { inputClass, labelClass } from "@/components/administracion/estilos";
import { get_current_requester_unit } from "@/lib/permisos/unidad_solicitante";

interface RequesterUnitFieldProps {
  /** Nombre del campo en el formato (`company` o `department`, según el permiso). */
  name: string;
  initialValue?: string;
}

/**
 * Selector de la compañía (colaborador de proveedor) o del departamento (empleado TFS) del solicitante, con
 * la de su perfil seleccionada por omisión. El servidor valida lo elegido al crear el documento
 * (`resolve_requester_unit`), así que un valor ajeno a la lista no se guarda.
 */
export async function RequesterUnitField({ name, initialValue }: RequesterUnitFieldProps) {
  const unit = await get_current_requester_unit();
  const id = `campo-${name}`;
  const label = unit.kind === "COMPANY" ? "Compañía del solicitante" : "Departamento del solicitante";
  const options = initialValue && !unit.options.includes(initialValue) ? [...unit.options, initialValue] : unit.options;

  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} name={name} required defaultValue={initialValue ?? unit.value} className={inputClass}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      <p className="mt-1 text-xs text-neutral-dark">Seleccionado según tu perfil.</p>
    </div>
  );
}
