/** Mensajes de los errores de firma (`?error=firma_<motivo>`), comunes a todos los formatos. */
export const signErrorMessages: Record<string, string> = {
  firma_SIN_AREA: "Este permiso no tiene un área asignada, por lo que no se puede firmar por rol.",
  firma_ACTOR_NO_ENCONTRADO: "No se encontró a la persona que firma.",
  firma_ACTOR_INACTIVO: "Tu cuenta o tu registro está inactivo.",
  firma_SIN_PERMISO_O_ALCANCE: "No tienes la autorización para firmar este rol en el área del permiso.",
  firma_CURSOS_REQUERIDOS_INCOMPLETOS: "Te faltan cursos requeridos para firmar este rol.",
  firma_ROL_NO_EXIGIDO_POR_PERMISO: "Este rol no se firma en este tipo de permiso.",
  firma_ROL_YA_FIRMADO: "Este rol ya fue firmado.",
  firma_PERSONA_YA_FIRMO_OTRO_ROL: "Una misma persona no puede firmar dos roles del permiso.",
  firma_PIN_NO_ACTIVADO: "Aún no tienes PIN de firma. Pide a un administrador de HSEA que lo active.",
  firma_PIN_BLOQUEADO: "Tu PIN está bloqueado por intentos fallidos. Intenta de nuevo más tarde.",
  firma_PIN_INCORRECTO: "PIN incorrecto.",
  firma_SEMAFORO_NO_VERDE: "Tu semáforo documental debe estar en verde para firmar.",
  firma_NO_ES_HSEA: "Solo el personal del departamento HSEA puede firmar las verificaciones.",
  firma_CUENTA_SIN_COLABORADOR:
    "Tu cuenta no está ligada a un colaborador, y este rol lo firma un colaborador con semáforo verde. Pide a HSEA que la ligue.",
};
