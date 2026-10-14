-- Fotografía del colaborador contratista (para la pantalla de acceso a planta con QR). Aditiva e idempotente.
-- Cada foto nueva se agrega como una fila; las anteriores se conservan. El archivo puede eliminarse a mano
-- (ruta NULL + archivo_eliminado_*), igual que las versiones de documentos. No participa en el semáforo.
CREATE TABLE IF NOT EXISTS fotos_colaborador (
  id                      bigserial PRIMARY KEY,
  empleado_proveedor_id   integer NOT NULL REFERENCES empleados_proveedor(id),
  nombre_archivo          text NOT NULL,
  tipo_mime               text NOT NULL CHECK (tipo_mime IN ('image/jpeg', 'image/png')),
  tamano_bytes            bigint NOT NULL CHECK (tamano_bytes > 0),
  ruta_almacenamiento     text,
  archivo_eliminado_en    timestamptz,
  archivo_eliminado_por   text,
  sha256                  text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  subido_por              text NOT NULL,
  subido_en               timestamptz NOT NULL DEFAULT now(),
  CHECK ((ruta_almacenamiento IS NULL) = (archivo_eliminado_en IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_fotos_colaborador_empleado ON fotos_colaborador(empleado_proveedor_id, id DESC);
