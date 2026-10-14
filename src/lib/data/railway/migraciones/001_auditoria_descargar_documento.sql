-- Agrega la acción 'descargar_documento' a la auditoría (quién descargó un documento con datos personales).
-- Idempotente: también es segura en una BD creada con el esquema más reciente.
ALTER TABLE eventos_auditoria DROP CONSTRAINT IF EXISTS eventos_auditoria_accion_check;
ALTER TABLE eventos_auditoria ADD CONSTRAINT eventos_auditoria_accion_check CHECK (accion IN (
  'crear', 'actualizar', 'eliminar', 'firmar',
  'subir_version', 'aprobar_revision', 'rechazar_revision',
  'asignar_rol', 'revocar_rol',
  'establecer_pin', 'verificar_pin_fallido', 'revocar_pin',
  'restablecer_password', 'purgar_archivo', 'descargar_documento',
  'iniciar_sesion', 'inicio_sesion_fallido', 'cerrar_sesion'));
