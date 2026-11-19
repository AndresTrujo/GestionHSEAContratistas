/*
  Restaura una sola firma por permiso y rol, incluidos los JSA.
  No modifica ni elimina firmas_permiso: su historial es append-only.
  Se precargan las claves históricas para impedir nuevas firmas en roles ya firmados.
*/
GO
-- Registra los roles que ya tienen firma, incluidos JSA que antes admitían varias.
-- No se alteran las firmas históricas.
INSERT INTO dbo.firmas_permiso_roles_unicos (permiso_id, rol_firma)
SELECT DISTINCT f.permiso_id, f.rol_firma
FROM dbo.firmas_permiso f
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.firmas_permiso_roles_unicos u
  WHERE u.permiso_id = f.permiso_id
    AND u.rol_firma = f.rol_firma
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
    FROM inserted
    GROUP BY permiso_id, rol_firma
    HAVING COUNT(*) > 1
  )
    THROW 50000, N'Solo se permite un firmante por rol en este permiso.', 1;

  -- La PK de firmas_permiso_roles_unicos hace cumplir la unicidad por permiso/rol,
  -- sin importar quién firma ni el tipo de permiso.
  INSERT INTO dbo.firmas_permiso_roles_unicos (permiso_id, rol_firma)
  SELECT DISTINCT permiso_id, rol_firma
  FROM inserted;
END
GO
