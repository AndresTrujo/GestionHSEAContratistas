/**
 * Trazabilidad: toda entidad persistida lleva metadatos de auditoría y
 * toda mutación genera un AuditEvent inmutable (solo se agregan, nunca se editan).
 *
 * Los valores de AuditAction, ActorType y entityType son los mismos que guarda
 * la tabla `eventos_auditoria` (src/lib/data/railway/esquema.sql).
 */

/**
 * Quién actúa: empleado TFS, usuario de proveedor (sin número de empleado) o el
 * sistema (autorregistro de proveedores, purga automática de archivos).
 */
export type ActorType = "EMPLEADO" | "USUARIO_PROVEEDOR" | "SISTEMA";

/**
 * Identidad del actor como texto: número de empleado ("204692"),
 * "P-" + id de usuario de proveedor ("P-17") o, para el sistema, un código en
 * mayúsculas ("AUTOREGISTRO", "PURGA"). El prefijo evita colisiones.
 */
export type ActorId = string;

export interface AuditMetadata {
  createdAt: string; // ISO 8601
  createdBy: ActorId;
  updatedAt: string;
  updatedBy: ActorId;
}

export type AuditAction =
  | "crear"
  | "actualizar"
  | "eliminar"
  | "firmar"
  | "subir_version"
  | "aprobar_revision"
  | "rechazar_revision"
  | "revocar_revision"
  | "asignar_rol"
  | "revocar_rol"
  | "establecer_pin"
  | "verificar_pin_fallido"
  | "revocar_pin"
  | "restablecer_password"
  | "purgar_archivo"
  | "descargar_documento"
  | "iniciar_sesion"
  | "inicio_sesion_fallido"
  | "cerrar_sesion";

export interface AuditEvent {
  id: string;
  /** Nombre de la tabla afectada, p. ej. "permisos_trabajo". */
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorType: ActorType;
  actorId: ActorId;
  occurredAt: string;
  /** Cambios o contexto relevante; sin valores `any`. */
  details: Record<string, string | number | boolean | null>;
}
