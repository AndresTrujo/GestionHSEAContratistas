/*
  Permite múltiples firmas por rol en JSA y conserva la exclusividad por rol
  para los demás tipos de permiso sin modificar firmas históricas (append-only).
*/

-- La migración anterior intentaba actualizar firmas históricas, lo cual está
-- prohibido por trg_firmas_inmutables. Aquí no se actualiza ni elimina ninguna firma.
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

IF EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.firmas_permiso')
    AND name = N'UX_firmas_permiso_permiso_rol_no_jsa'
)
BEGIN
  DROP INDEX UX_firmas_permiso_permiso_rol_no_jsa ON dbo.firmas_permiso;
END;

IF OBJECT_ID(N'dbo.firmas_permiso_roles_unicos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.firmas_permiso_roles_unicos (
    permiso_id nvarchar(450) NOT NULL REFERENCES dbo.permisos_trabajo(id),
    rol_firma nvarchar(100) NOT NULL REFERENCES dbo.roles_firma(codigo),
    CONSTRAINT PK_firmas_permiso_roles_unicos PRIMARY KEY (permiso_id, rol_firma)
  );
END;

-- Precarga los roles históricos de permisos no JSA. INSERT no viola la inmutabilidad
-- de firmas_permiso; la tabla auxiliar guarda la exclusividad futura.
INSERT INTO dbo.firmas_permiso_roles_unicos (permiso_id, rol_firma)
SELECT DISTINCT fp.permiso_id, fp.rol_firma
FROM dbo.firmas_permiso fp
INNER JOIN dbo.permisos_trabajo p ON p.id = fp.permiso_id
WHERE p.tipo_permiso_slug <> N'analisis-seguridad-jsa'
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.firmas_permiso_roles_unicos u
    WHERE u.permiso_id = fp.permiso_id
      AND u.rol_firma = fp.rol_firma
  );

GO

CREATE OR ALTER TRIGGER dbo.trg_firmas_permiso_un_rol_no_jsa
ON dbo.firmas_permiso
AFTER INSERT
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (
    SELECT 1
    FROM inserted i
    INNER JOIN dbo.permisos_trabajo p ON p.id = i.permiso_id
    WHERE p.tipo_permiso_slug <> N'analisis-seguridad-jsa'
    GROUP BY i.permiso_id, i.rol_firma
    HAVING COUNT(*) > 1
  )
    THROW 50000, N'Solo se permite un firmante por rol en este tipo de permiso.', 1;

  INSERT INTO dbo.firmas_permiso_roles_unicos (permiso_id, rol_firma)
  SELECT DISTINCT i.permiso_id, i.rol_firma
  FROM inserted i
  INNER JOIN dbo.permisos_trabajo p ON p.id = i.permiso_id
  WHERE p.tipo_permiso_slug <> N'analisis-seguridad-jsa';
END
GO
