-- Equipos motorizados por categoría. Catálogo de tipos de equipo y documentos obligatorios según la categoría:
--   Equipos (grúa, montacargas, plataforma autoelevable): certificado de operación segura + seguro.
--   Unidades (vehículos, camiones, camioneta de 3 Tons):   tarjeta de circulación + seguro + verificación.
-- Idempotente: esquema.sql ya lo trae, así que en una BD nueva no hace nada.
-- Los documentos que dejan de exigirse (certificado de calidad, programa de mantenimiento, tenencia) se
-- desactivan, no se borran: los ya subidos conservan su historial.

IF OBJECT_ID(N'dbo.tipos_equipo', N'U') IS NULL
  CREATE TABLE dbo.tipos_equipo (
    codigo                  nvarchar(450) NOT NULL PRIMARY KEY,
    nombre                  nvarchar(450) NOT NULL,
    categoria               nvarchar(10) NOT NULL CHECK (categoria IN (N'EQUIPO', N'UNIDAD')),
    activo                  bit NOT NULL DEFAULT 1
  );
GO

IF COL_LENGTH(N'dbo.tipos_documento', N'categoria_equipo') IS NULL
  ALTER TABLE dbo.tipos_documento ADD categoria_equipo nvarchar(10) NULL
    CONSTRAINT ck_tipos_documento_categoria_equipo CHECK (categoria_equipo IN (N'EQUIPO', N'UNIDAD'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'ck_tipos_documento_categoria_aplica')
  ALTER TABLE dbo.tipos_documento ADD CONSTRAINT ck_tipos_documento_categoria_aplica
    CHECK (categoria_equipo IS NULL OR aplica_a = N'EQUIPO');
GO

INSERT INTO dbo.tipos_equipo (codigo, nombre, categoria)
SELECT v.codigo, v.nombre, v.categoria
  FROM (VALUES
    (N'GRUA',                    N'Grúa',                    N'EQUIPO'),
    (N'MONTACARGAS',             N'Montacargas',             N'EQUIPO'),
    (N'PLATAFORMA_AUTOELEVABLE', N'Plataforma autoelevable', N'EQUIPO'),
    (N'VEHICULO_PICKUP',         N'Vehículo (Pickup)',       N'UNIDAD'),
    (N'VEHICULO_SEDAN',          N'Vehículo (Sedán)',        N'UNIDAD'),
    (N'CAMION',                  N'Camión',                  N'UNIDAD'),
    (N'CAMION_DE_CARGA',         N'Camión de carga',         N'UNIDAD'),
    (N'CAMIONETA_3_TONS',        N'Camioneta de 3 Tons',     N'UNIDAD')
  ) AS v (codigo, nombre, categoria)
 WHERE NOT EXISTS (SELECT 1 FROM dbo.tipos_equipo t WHERE t.codigo = v.codigo);

INSERT INTO dbo.tipos_documento
  (codigo, nombre, aplica_a, categoria, obligatorio, vigencia_meses, tipo_trabajo_codigo, permiso_revision, categoria_equipo)
SELECT v.codigo, v.nombre, N'EQUIPO', N'CERTIFICACION', 1, NULL, NULL, N'contratistas:revisar_documentos', v.categoria_equipo
  FROM (VALUES
    (N'CERT_OPERACION_SEGURA', N'Certificado de operación segura (vigente)', N'EQUIPO'),
    (N'TARJETA_CIRCULACION',   N'Tarjeta de circulación',                    N'UNIDAD')
  ) AS v (codigo, nombre, categoria_equipo)
 WHERE NOT EXISTS (SELECT 1 FROM dbo.tipos_documento t WHERE t.codigo = v.codigo);

-- El seguro aplica a todas las categorías; la verificación solo a unidades.
UPDATE dbo.tipos_documento SET nombre = N'Seguro vigente', categoria_equipo = NULL WHERE codigo = N'POLIZA_SEGURO';
UPDATE dbo.tipos_documento SET categoria_equipo = N'UNIDAD' WHERE codigo = N'VERIF_VEHICULAR';

-- Ya no se exigen.
UPDATE dbo.tipos_documento SET activo = 0
 WHERE codigo IN (N'CERT_CALIDAD', N'PROG_MANTENIMIENTO', N'TENENCIA_VEHICULAR') AND activo = 1;
GO

-- Semáforo de equipos: ahora cada equipo se evalúa solo contra los documentos de su categoría. Un tipo que no está
-- en el catálogo (registros anteriores con texto libre) solo exige los generales (categoria_equipo NULL).
CREATE OR ALTER VIEW dbo.v_semaforo_equipo_proveedor AS
  SELECT e.id AS equipo_proveedor_id, e.proveedor_id,
         CASE WHEN p.estatus <> N'ACTIVO'
                OR MAX(CASE WHEN COALESCE(de.estado, N'FALTANTE') IN (N'FALTANTE', N'RECHAZADO', N'REVOCADO', N'VENCIDO') THEN 1 ELSE 0 END) = 1 THEN N'ROJO'
              WHEN MIN(CASE WHEN de.estado = N'APROBADO' THEN 1 ELSE 0 END) = 1 THEN N'VERDE'
              ELSE N'AMARILLO' END AS semaforo
    FROM dbo.equipos_proveedor e
    JOIN dbo.proveedores p ON p.id = e.proveedor_id
    LEFT JOIN dbo.tipos_equipo te ON te.codigo = e.tipo_equipo
    JOIN dbo.tipos_documento td ON td.aplica_a = N'EQUIPO' AND td.activo = 1 AND td.obligatorio = 1
     AND (td.categoria_equipo IS NULL OR td.categoria_equipo = te.categoria)
    LEFT JOIN dbo.v_documentos_estado de
      ON de.equipo_proveedor_id = e.id AND de.tipo_documento_codigo = td.codigo
   WHERE e.activo = 1
   GROUP BY e.id, e.proveedor_id, p.estatus;
GO
