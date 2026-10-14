-- El Administrador HSEA también puede firmar como HSEA (firmar:supervisor_hsea).
-- Idempotente: si el rol ya tiene el permiso, no hace nada.
INSERT INTO rol_permisos (rol_id, permiso_codigo)
SELECT r.id, 'firmar:supervisor_hsea' FROM roles r WHERE r.codigo = 'ADMIN_HSEA'
ON CONFLICT DO NOTHING;
