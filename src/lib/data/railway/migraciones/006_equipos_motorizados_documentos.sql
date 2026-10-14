-- Equipos motorizados: cinco documentos obligatorios por equipo (reemplazan a la certificación genérica).
-- La certificación genérica se desactiva, no se borra: sus documentos ya cargados conservan su trazabilidad.
-- Idempotente.
INSERT INTO tipos_documento
  (codigo, nombre, aplica_a, categoria, obligatorio, vigencia_meses, tipo_trabajo_codigo, permiso_revision) VALUES
  ('CERT_CALIDAD',       'Certificado de calidad',     'EQUIPO', 'CERTIFICACION', true, NULL, NULL, 'contratistas:revisar_documentos'),
  ('PROG_MANTENIMIENTO', 'Programa de mantenimiento',  'EQUIPO', 'CERTIFICACION', true, NULL, NULL, 'contratistas:revisar_documentos'),
  ('POLIZA_SEGURO',      'Póliza de seguro',           'EQUIPO', 'CERTIFICACION', true, 12,   NULL, 'contratistas:revisar_documentos'),
  ('VERIF_VEHICULAR',    'Verificación vehicular',     'EQUIPO', 'CERTIFICACION', true, 6,    NULL, 'contratistas:revisar_documentos'),
  ('TENENCIA_VEHICULAR', 'Tenencia vehicular',         'EQUIPO', 'CERTIFICACION', true, 12,   NULL, 'contratistas:revisar_documentos')
ON CONFLICT (codigo) DO NOTHING;

UPDATE tipos_documento SET activo = false WHERE codigo = 'CERT_EQUIPO';
