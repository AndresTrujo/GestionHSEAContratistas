-- El Administrador HSEA también puede validar exámenes médicos de contratistas.
-- Idempotente: si el rol ya tiene el permiso, no hace nada.
INSERT INTO rol_permisos (rol_id, permiso_codigo)
SELECT r.id, 'contratistas:validar_medico' FROM roles r WHERE r.codigo = 'ADMIN_HSEA'
ON CONFLICT DO NOTHING;
