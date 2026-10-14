-- Registro técnico del servidor (errores, avisos): solo se agrega, no se modifica ni se borra. Idempotente.
CREATE TABLE IF NOT EXISTS registro_servidor (
  id                  bigserial PRIMARY KEY,
  ocurrido_en         timestamptz NOT NULL DEFAULT now(),
  nivel               text NOT NULL CHECK (nivel IN ('ERROR', 'WARN', 'INFO')),
  origen              text NOT NULL,
  mensaje             text NOT NULL,
  detalle             text,
  contexto            jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_registro_servidor_nivel ON registro_servidor(nivel, ocurrido_en DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_registro_servidor_inmutable') THEN
    CREATE TRIGGER trg_registro_servidor_inmutable
      BEFORE UPDATE OR DELETE ON registro_servidor
      FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();
  END IF;
END $$;
