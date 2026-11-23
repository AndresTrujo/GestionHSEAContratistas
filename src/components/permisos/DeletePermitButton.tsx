"use client";

import { delete_work_permit } from "@/lib/permisos/eliminar_permiso_acciones";

interface DeletePermitButtonProps {
  permitId: string;
  label?: string;
}

/** Acción destructiva reservada a ADMIN_HSEA; el servidor vuelve a validar el rol. */
export function DeletePermitButton({ permitId, label = "Eliminar Permiso" }: DeletePermitButtonProps) {
  return (
    <form
      action={delete_work_permit}
      onSubmit={(event) => {
        if (!window.confirm(`¿Seguro que deseas ${label.toLowerCase()}? Esta acción ocultará el registro y conservará su historial.`)) {
          event.preventDefault();
        }
      }}
      className="inline-block"
    >
      <input type="hidden" name="permitId" value={permitId} />
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-xl border border-red-700 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      >
        {label}
      </button>
    </form>
  );
}
