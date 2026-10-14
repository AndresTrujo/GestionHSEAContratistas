-- Revocación de documentos ya aprobados (error humano): tabla anexada, estado REVOCADO en las vistas
-- (semáforo ROJO) y la acción 'revocar_revision' en la auditoría. Idempotente.

CREATE TABLE IF NOT EXISTS revocaciones_revision (
  revision_id             bigint PRIMARY KEY REFERENCES revisiones_documento(id),
  revocado_por            integer NOT NULL REFERENCES empleados(no_empleado),
  motivo                  text NOT NULL CHECK (length(btrim(motivo)) > 0),
  revocado_en             timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_revocaciones_inmutables ON revocaciones_revision;
CREATE TRIGGER trg_revocaciones_inmutables
  BEFORE UPDATE OR DELETE ON revocaciones_revision
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();

CREATE OR REPLACE VIEW v_documentos_estado AS
  SELECT d.id AS documento_id, d.empleado_proveedor_id, d.equipo_proveedor_id,
         d.tipo_documento_codigo, v.id AS version_id, v.numero_version,
         r.resultado AS resultado_revision, vig.vigente_hasta,
         CASE WHEN rv.revision_id IS NOT NULL             THEN 'REVOCADO'
              WHEN r.resultado = 'RECHAZADO'              THEN 'RECHAZADO'
              WHEN vig.vigente_hasta < hoy_mx()            THEN 'VENCIDO'
              WHEN r.resultado = 'APROBADO'                THEN 'APROBADO'
              ELSE 'EN_REVISION' END AS estado
    FROM documentos_contratista d
    JOIN tipos_documento td ON td.codigo = d.tipo_documento_codigo
    JOIN LATERAL (SELECT * FROM versiones_documento x
                   WHERE x.documento_id = d.id
                   ORDER BY x.numero_version DESC LIMIT 1) v ON true
    LEFT JOIN revisiones_documento r ON r.version_id = v.id
    LEFT JOIN revocaciones_revision rv ON rv.revision_id = r.id
    CROSS JOIN LATERAL (
      SELECT LEAST(v.fecha_vencimiento,
                   (COALESCE(v.fecha_emision, (v.subido_en AT TIME ZONE 'America/Mexico_City')::date)
                      + make_interval(months => td.vigencia_meses))::date) AS vigente_hasta
    ) vig;

CREATE OR REPLACE VIEW v_semaforo_empleado_proveedor AS
  SELECT ep.id AS empleado_proveedor_id, ep.proveedor_id,
         CASE WHEN p.estatus <> 'ACTIVO'
                OR bool_or(rq.estado IN ('FALTANTE', 'RECHAZADO', 'REVOCADO', 'VENCIDO')) THEN 'ROJO'
              WHEN bool_and(rq.estado = 'APROBADO')                             THEN 'VERDE'
              ELSE 'AMARILLO' END AS semaforo
    FROM empleados_proveedor ep
    JOIN proveedores p ON p.id = ep.proveedor_id
    JOIN v_requisitos_empleado_proveedor rq ON rq.empleado_proveedor_id = ep.id
   GROUP BY ep.id, ep.proveedor_id, p.estatus;

CREATE OR REPLACE VIEW v_semaforo_equipo_proveedor AS
  SELECT e.id AS equipo_proveedor_id, e.proveedor_id,
         CASE WHEN p.estatus <> 'ACTIVO'
                OR bool_or(COALESCE(de.estado, 'FALTANTE') IN ('FALTANTE', 'RECHAZADO', 'REVOCADO', 'VENCIDO')) THEN 'ROJO'
              WHEN bool_and(de.estado = 'APROBADO')                                                  THEN 'VERDE'
              ELSE 'AMARILLO' END AS semaforo
    FROM equipos_proveedor e
    JOIN proveedores p ON p.id = e.proveedor_id
    JOIN tipos_documento td ON td.aplica_a = 'EQUIPO' AND td.activo AND td.obligatorio
    LEFT JOIN v_documentos_estado de
      ON de.equipo_proveedor_id = e.id AND de.tipo_documento_codigo = td.codigo
   WHERE e.activo
   GROUP BY e.id, e.proveedor_id, p.estatus;

ALTER TABLE eventos_auditoria DROP CONSTRAINT IF EXISTS eventos_auditoria_accion_check;
ALTER TABLE eventos_auditoria ADD CONSTRAINT eventos_auditoria_accion_check CHECK (accion IN (
  'crear', 'actualizar', 'eliminar', 'firmar',
  'subir_version', 'aprobar_revision', 'rechazar_revision', 'revocar_revision',
  'asignar_rol', 'revocar_rol',
  'establecer_pin', 'verificar_pin_fallido', 'revocar_pin',
  'restablecer_password', 'purgar_archivo', 'descargar_documento',
  'iniciar_sesion', 'inicio_sesion_fallido', 'cerrar_sesion'));
