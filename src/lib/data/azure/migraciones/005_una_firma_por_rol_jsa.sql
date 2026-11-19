/*
  Restaura una sola firma por permiso y rol, incluidos los JSA.
  No modifica ni elimina firmas_permiso: su historial es append-only.
  El registro de exclusividad se aplica a nuevas firmas; no reescribe duplicados históricos.
*/
GO
CREATE OR ALTER TRIGGER dbo.trg_firmas_permiso_un_rol_no_jsa
ON dbo.firmas_permiso
AFTER INSERT
AS
BEGIN
  SET NOCOUNT ON;

  -- La PK de firmas_permiso_roles_unicos garantiza una sola firma nueva por permiso/rol,
  -- independientemente del tipo de permiso. No se usa la identidad del empleado como clave.
  INSERT INTO dbo.firmas_permiso_roles_unicos (permiso_id, rol_firma)
  SELECT DISTINCT permiso_id, rol_firma
  FROM inserted;
END
GO
