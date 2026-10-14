-- Documentos del proveedor (persona moral): el comprobante de pago del IMSS lo sube la empresa, no cada colaborador.
-- Aditiva e idempotente: no borra datos. El IMSS_PAGO por colaborador se desactiva (sus documentos ya cargados
-- conservan su trazabilidad) y lo sustituye IMSS_PAGO_PROVEEDOR, que cuenta para el semáforo de todo el personal.

-- 1) tipos_documento admite 'PROVEEDOR' como dueño del documento.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
    FROM pg_constraint
   WHERE conrelid = 'tipos_documento'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%aplica_a%EQUIPO%'
     AND pg_get_constraintdef(oid) NOT LIKE '%tipo_trabajo_codigo%'
     AND pg_get_constraintdef(oid) NOT LIKE '%PROVEEDOR%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tipos_documento DROP CONSTRAINT %I', v_constraint);
    ALTER TABLE tipos_documento
      ADD CONSTRAINT tipos_documento_aplica_a_check CHECK (aplica_a IN ('EMPLEADO', 'EQUIPO', 'PROVEEDOR'));
  END IF;
END $$;

-- 2) documentos_contratista puede colgar directamente del proveedor.
ALTER TABLE documentos_contratista ADD COLUMN IF NOT EXISTS proveedor_id integer REFERENCES proveedores(id);

DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
    FROM pg_constraint
   WHERE conrelid = 'documentos_contratista'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%num_nonnulls%'
     AND pg_get_constraintdef(oid) NOT LIKE '%equipo_proveedor_id, proveedor_id%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE documentos_contratista DROP CONSTRAINT %I', v_constraint);
    ALTER TABLE documentos_contratista
      ADD CONSTRAINT documentos_contratista_un_dueno
      CHECK (num_nonnulls(empleado_proveedor_id, equipo_proveedor_id, proveedor_id) = 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documento_proveedor
  ON documentos_contratista(proveedor_id, tipo_documento_codigo) WHERE proveedor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validar_documento_contratista() RETURNS trigger AS $$
DECLARE
  v_aplica_a text;
BEGIN
  SELECT aplica_a INTO v_aplica_a FROM tipos_documento WHERE codigo = NEW.tipo_documento_codigo;
  IF (v_aplica_a = 'EMPLEADO' AND NEW.empleado_proveedor_id IS NULL)
     OR (v_aplica_a = 'EQUIPO' AND NEW.equipo_proveedor_id IS NULL)
     OR (v_aplica_a = 'PROVEEDOR' AND NEW.proveedor_id IS NULL) THEN
    RAISE EXCEPTION 'El documento % no aplica a este tipo de sujeto', NEW.tipo_documento_codigo;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Nuevo tipo a nivel proveedor; el de colaborador se desactiva (no se borra).
INSERT INTO tipos_documento
  (codigo, nombre, aplica_a, categoria, obligatorio, vigencia_meses, tipo_trabajo_codigo, permiso_revision) VALUES
  ('IMSS_PAGO_PROVEEDOR', 'Comprobante de pago del IMSS', 'PROVEEDOR', 'IMSS', true, NULL, NULL, 'contratistas:revisar_documentos')
ON CONFLICT (codigo) DO NOTHING;

UPDATE tipos_documento SET activo = false WHERE codigo = 'IMSS_PAGO';

-- 4) Vistas: el estado expone el proveedor dueño y los requisitos del colaborador incluyen los del proveedor.
CREATE OR REPLACE VIEW v_documentos_estado AS
  SELECT d.id AS documento_id, d.empleado_proveedor_id, d.equipo_proveedor_id,
         d.tipo_documento_codigo, v.id AS version_id, v.numero_version,
         r.resultado AS resultado_revision, vig.vigente_hasta,
         CASE WHEN rv.revision_id IS NOT NULL             THEN 'REVOCADO'
              WHEN r.resultado = 'RECHAZADO'              THEN 'RECHAZADO'
              WHEN vig.vigente_hasta < hoy_mx()            THEN 'VENCIDO'
              WHEN r.resultado = 'APROBADO'                THEN 'APROBADO'
              ELSE 'EN_REVISION' END AS estado,
         d.proveedor_id
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

CREATE OR REPLACE VIEW v_requisitos_empleado_proveedor AS
  SELECT ep.id AS empleado_proveedor_id, td.codigo AS tipo_documento_codigo,
         COALESCE(de.estado, 'FALTANTE') AS estado, de.vigente_hasta
    FROM empleados_proveedor ep
    JOIN tipos_documento td
      ON td.aplica_a IN ('EMPLEADO', 'PROVEEDOR') AND td.activo
     AND (td.obligatorio
          OR EXISTS (SELECT 1 FROM empleado_proveedor_trabajos t
                      WHERE t.empleado_proveedor_id = ep.id
                        AND t.retirado_en IS NULL
                        AND t.tipo_trabajo_codigo = td.tipo_trabajo_codigo))
    LEFT JOIN v_documentos_estado de
      ON de.tipo_documento_codigo = td.codigo
     AND ((td.aplica_a = 'EMPLEADO'  AND de.empleado_proveedor_id = ep.id)
          OR (td.aplica_a = 'PROVEEDOR' AND de.proveedor_id = ep.proveedor_id))
   WHERE ep.activo;
