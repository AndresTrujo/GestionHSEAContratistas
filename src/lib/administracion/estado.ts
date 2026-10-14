/** Resultado de una acción de administración, mostrado en el formulario que la lanzó. */
export interface ActionState {
  /** null = aún no se ha enviado. */
  ok: boolean | null;
  message: string;
  /** Dato sensible que se muestra una sola vez (p. ej. contraseña temporal); nunca viaja en la URL. */
  secret?: string;
  /** Cuentas recién creadas (alta de colaboradores); la contraseña se muestra una sola vez. */
  credentials?: { name: string; username: string; password: string }[];
}

export const initialActionState: ActionState = { ok: null, message: "" };
