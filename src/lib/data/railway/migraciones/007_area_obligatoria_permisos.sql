-- El área del permiso es obligatoria (los seis formatos ya la piden). Los permisos anteriores sin área se
-- conservan: la restricción se crea NOT VALID, así solo exige el área a los permisos nuevos y a los que
-- se modifiquen. Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_permiso_area_obligatoria') THEN
    ALTER TABLE permisos_trabajo
      ADD CONSTRAINT chk_permiso_area_obligatoria CHECK (departamento_id IS NOT NULL) NOT VALID;
  END IF;
END $$;
