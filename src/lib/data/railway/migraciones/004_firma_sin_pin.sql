-- La firma de permisos ya no exige PIN: la credencial verificada pasa a ser opcional.
-- Idempotente.
ALTER TABLE firmas_permiso ALTER COLUMN credencial_firma_id DROP NOT NULL;
