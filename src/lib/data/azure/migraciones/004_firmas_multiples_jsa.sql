/*
  JSA: una sola firma por rol, pero una misma persona puede firmar roles distintos.
  No se modifican ni eliminan firmas históricas (firmas_permiso es append-only).
*/

-- Retira la regla temporal que permitía múltiples firmantes por rol en JSA.
IF OBJECT_ID(N'dbo.trg_firmas_permiso_un_rol_no_jsa', N'TR') IS NOT NULL
  DROP TRIGGER dbo.trg_firmas_permiso_un_rol_no_jsa;

-- La unicidad es por permiso y rol, NO por empleado:
-- el mismo empleado puede aparecer en varios roles del mismo JSA.
IF NOT EXISTS (
  SELECT 1
  FROM sys.key_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.firmas_permiso')
    AND name = N'firmas_permiso_permiso_id_rol_firma_key'
)
BEGIN
  ALTER TABLE dbo.firmas_permiso
    ADD CONSTRAINT firmas_permiso_permiso_id_rol_firma_key
    UNIQUE (permiso_id, rol_firma);
END;
