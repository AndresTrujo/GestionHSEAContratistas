SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @prov int = 7;

DISABLE TRIGGER dbo.trg_firmas_inmutables ON dbo.firmas_permiso;
DISABLE TRIGGER dbo.trg_revocaciones_inmutables ON dbo.revocaciones_revision;
DISABLE TRIGGER dbo.trg_revisiones_inmutables ON dbo.revisiones_documento;
DISABLE TRIGGER dbo.trg_versiones_inmutables ON dbo.versiones_documento;
DISABLE TRIGGER dbo.trg_documentos_inmutables ON dbo.documentos_contratista;
DISABLE TRIGGER dbo.trg_permisos_sin_borrado ON dbo.permisos_trabajo;
DISABLE TRIGGER dbo.trg_participantes_sin_borrado ON dbo.permiso_participantes;
DISABLE TRIGGER dbo.trg_ingreso_sin_borrado ON dbo.registros_ingreso;
DISABLE TRIGGER dbo.trg_emp_proveedor_sin_borrado ON dbo.empleados_proveedor;
DISABLE TRIGGER dbo.trg_equipos_proveedor_sin_borrado ON dbo.equipos_proveedor;
DISABLE TRIGGER dbo.trg_usuarios_proveedor_sin_borrado ON dbo.usuarios_proveedor;
DISABLE TRIGGER dbo.trg_credenciales_sin_borrado ON dbo.credenciales_firma;
DISABLE TRIGGER dbo.trg_proveedores_sin_borrado ON dbo.proveedores;

DELETE FROM dbo.firmas_permiso
WHERE permiso_id IN (
        SELECT id FROM dbo.permisos_trabajo
        WHERE proveedor_id = @prov
           OR solicitante_usuario_proveedor_id IN (SELECT id FROM dbo.usuarios_proveedor WHERE proveedor_id = @prov))
   OR usuario_proveedor_id IN (SELECT id FROM dbo.usuarios_proveedor WHERE proveedor_id = @prov);

DELETE FROM dbo.credenciales_firma
WHERE usuario_proveedor_id IN (SELECT id FROM dbo.usuarios_proveedor WHERE proveedor_id = @prov);

DELETE FROM dbo.registros_ingreso
WHERE empleado_proveedor_id IN (SELECT id FROM dbo.empleados_proveedor WHERE proveedor_id = @prov)
   OR permiso_id IN (SELECT id FROM dbo.permisos_trabajo WHERE proveedor_id = @prov);

DELETE FROM dbo.permiso_participantes
WHERE empleado_proveedor_id IN (SELECT id FROM dbo.empleados_proveedor WHERE proveedor_id = @prov)
   OR permiso_id IN (SELECT id FROM dbo.permisos_trabajo WHERE proveedor_id = @prov);

DELETE FROM dbo.permisos_trabajo
WHERE proveedor_id = @prov
   OR solicitante_usuario_proveedor_id IN (SELECT id FROM dbo.usuarios_proveedor WHERE proveedor_id = @prov);

DELETE FROM dbo.revocaciones_revision
WHERE revision_id IN (
  SELECT r.id FROM dbo.revisiones_documento r
  JOIN dbo.versiones_documento v ON v.id = r.version_id
  JOIN dbo.documentos_contratista d ON d.id = v.documento_id
  WHERE d.proveedor_id = @prov
     OR d.empleado_proveedor_id IN (SELECT id FROM dbo.empleados_proveedor WHERE proveedor_id = @prov)
     OR d.equipo_proveedor_id IN (SELECT id FROM dbo.equipos_proveedor WHERE proveedor_id = @prov));

DELETE FROM dbo.revisiones_documento
WHERE version_id IN (
  SELECT v.id FROM dbo.versiones_documento v
  JOIN dbo.documentos_contratista d ON d.id = v.documento_id
  WHERE d.proveedor_id = @prov
     OR d.empleado_proveedor_id IN (SELECT id FROM dbo.empleados_proveedor WHERE proveedor_id = @prov)
     OR d.equipo_proveedor_id IN (SELECT id FROM dbo.equipos_proveedor WHERE proveedor_id = @prov));

DELETE FROM dbo.versiones_documento
WHERE documento_id IN (
  SELECT d.id FROM dbo.documentos_contratista d
  WHERE d.proveedor_id = @prov
     OR d.empleado_proveedor_id IN (SELECT id FROM dbo.empleados_proveedor WHERE proveedor_id = @prov)
     OR d.equipo_proveedor_id IN (SELECT id FROM dbo.equipos_proveedor WHERE proveedor_id = @prov));

DELETE FROM dbo.documentos_contratista
WHERE proveedor_id = @prov
   OR empleado_proveedor_id IN (SELECT id FROM dbo.empleados_proveedor WHERE proveedor_id = @prov)
   OR equipo_proveedor_id IN (SELECT id FROM dbo.equipos_proveedor WHERE proveedor_id = @prov);

DELETE FROM dbo.fotos_colaborador
WHERE empleado_proveedor_id IN (SELECT id FROM dbo.empleados_proveedor WHERE proveedor_id = @prov);

DELETE FROM dbo.empleado_proveedor_trabajos
WHERE empleado_proveedor_id IN (SELECT id FROM dbo.empleados_proveedor WHERE proveedor_id = @prov);

DELETE FROM dbo.usuarios_proveedor WHERE proveedor_id = @prov;
DELETE FROM dbo.equipos_proveedor WHERE proveedor_id = @prov;
DELETE FROM dbo.empleados_proveedor WHERE proveedor_id = @prov;
DELETE FROM dbo.proveedor_tipos_contratista WHERE proveedor_id = @prov;
DELETE FROM dbo.proveedores WHERE id = @prov;

ENABLE TRIGGER dbo.trg_firmas_inmutables ON dbo.firmas_permiso;
ENABLE TRIGGER dbo.trg_revocaciones_inmutables ON dbo.revocaciones_revision;
ENABLE TRIGGER dbo.trg_revisiones_inmutables ON dbo.revisiones_documento;
ENABLE TRIGGER dbo.trg_versiones_inmutables ON dbo.versiones_documento;
ENABLE TRIGGER dbo.trg_documentos_inmutables ON dbo.documentos_contratista;
ENABLE TRIGGER dbo.trg_permisos_sin_borrado ON dbo.permisos_trabajo;
ENABLE TRIGGER dbo.trg_participantes_sin_borrado ON dbo.permiso_participantes;
ENABLE TRIGGER dbo.trg_ingreso_sin_borrado ON dbo.registros_ingreso;
ENABLE TRIGGER dbo.trg_emp_proveedor_sin_borrado ON dbo.empleados_proveedor;
ENABLE TRIGGER dbo.trg_equipos_proveedor_sin_borrado ON dbo.equipos_proveedor;
ENABLE TRIGGER dbo.trg_usuarios_proveedor_sin_borrado ON dbo.usuarios_proveedor;
ENABLE TRIGGER dbo.trg_credenciales_sin_borrado ON dbo.credenciales_firma;
ENABLE TRIGGER dbo.trg_proveedores_sin_borrado ON dbo.proveedores;

COMMIT TRANSACTION;
