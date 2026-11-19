/*
  Permite múltiples firmas por rol en JSA, conservando la restricción
  de un firmante por rol para los demás tipos de permiso.
*/
IF COL_LENGTH(N'dbo.firmas_permiso', N'tipo_permiso_slug') IS NULL
BEGIN
  ALTER TABLE dbo.firmas_permiso
    ADD tipo_permiso_slug nvarchar(100) NULL;
END;
GO

UPDATE fp
   SET tipo_permiso_slug = pt.tipo_permiso_slug
FROM dbo.firmas_permiso fp
JOIN dbo.permisos_trabajo pt ON pt.id = fp.permiso_id
WHERE fp.tipo_permiso_slug IS NULL;

IF EXISTS (
  SELECT 1
  FROM dbo.firmas_permiso
  WHERE tipo_permiso_slug IS NULL
)
BEGIN
  THROW 51000, 'No fue posible asociar todas las firmas con su tipo de permiso.', 1;
END;

ALTER TABLE dbo.firmas_permiso
  ALTER COLUMN tipo_permiso_slug nvarchar(100) NOT NULL;

IF EXISTS (
  SELECT 1
  FROM sys.key_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.firmas_permiso')
    AND name = N'firmas_permiso_permiso_id_rol_firma_key'
)
BEGIN
  ALTER TABLE dbo.firmas_permiso
    DROP CONSTRAINT firmas_permiso_permiso_id_rol_firma_key;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.firmas_permiso')
    AND name = N'UX_firmas_permiso_permiso_rol_no_jsa'
)
BEGIN
  CREATE UNIQUE INDEX UX_firmas_permiso_permiso_rol_no_jsa
    ON dbo.firmas_permiso(permiso_id, rol_firma)
    WHERE tipo_permiso_slug <> N'analisis-seguridad-jsa';
END;

