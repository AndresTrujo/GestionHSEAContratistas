import { inputClass, labelClass } from "@/components/administracion/estilos";

interface PermitFieldProps {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  /** Por omisión los campos del formato son obligatorios. */
  required?: boolean;
  hint?: string;
  /** Ocupa las dos columnas de la cuadrícula. */
  wide?: boolean;
  /** Campo de varias líneas. */
  rows?: number;
}

/** Campo de texto, fecha, hora o área de texto de los formularios de permisos, con etiqueta visible y ayuda opcional. */
export function PermitField({ label, name, type = "text", defaultValue, required = true, hint, wide = false, rows }: PermitFieldProps) {
  const id = `campo-${name}`;
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className={labelClass}>
        {label}
        {!required && <span className="font-normal text-neutral-dark"> (opcional)</span>}
      </label>
      {rows ? (
        <textarea id={id} name={name} defaultValue={defaultValue} required={required} rows={rows} className={inputClass} />
      ) : (
        <input id={id} name={name} type={type} defaultValue={defaultValue} required={required} className={inputClass} />
      )}
      {hint && <p className="mt-1 text-xs text-neutral-dark">{hint}</p>}
    </div>
  );
}
