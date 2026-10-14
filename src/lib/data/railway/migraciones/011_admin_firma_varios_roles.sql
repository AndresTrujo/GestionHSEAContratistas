-- El Administrador HSEA puede firmar más de un rol en un mismo permiso. La segregación para el resto de las
-- personas se valida en la aplicación (can_sign), por lo que se retiran los índices únicos por persona.
-- Se conserva UNIQUE (permiso_id, rol_firma): cada rol sigue teniendo una sola firma. Idempotente.
DROP INDEX IF EXISTS uq_firma_persona_empleado;
DROP INDEX IF EXISTS uq_firma_persona_proveedor;
