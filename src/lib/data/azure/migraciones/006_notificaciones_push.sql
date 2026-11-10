-- Notificaciones push de firmas pendientes (permisos de trabajo, AST y STOP).
--   suscripciones_push: dispositivos suscritos de cada persona; se revocan, no se borran.
--   notificaciones_push: bitácora inmutable de cada aviso enviado (trazabilidad y base de los recordatorios).
--   tareas_programadas: candado por tiempo para que, con varias instancias, solo una envíe los recordatorios.
-- Idempotente: esquema.sql ya trae todo esto.

IF OBJECT_ID(N'dbo.suscripciones_push', N'U') IS NULL
  CREATE TABLE dbo.suscripciones_push (
    id                  bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    propietario_tipo    nvarchar(30) NOT NULL CHECK (propietario_tipo IN (N'EMPLEADO', N'USUARIO_PROVEEDOR')),
    propietario_id      nvarchar(450) NOT NULL,               -- '204692' | 'P-17'
    endpoint            nvarchar(max) NOT NULL,
    endpoint_hash       char(64) NOT NULL,                    -- sha256 del endpoint (la URL no cabe en un índice)
    p256dh              nvarchar(200) NOT NULL,
    auth                nvarchar(100) NOT NULL,
    agente_usuario      nvarchar(500) NULL,
    creada_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    ultimo_uso_en       datetimeoffset(3) NULL,
    revocada_en         datetimeoffset(3) NULL,
    motivo_revocacion   nvarchar(200) NULL
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_suscripciones_push_endpoint_activa')
  CREATE UNIQUE INDEX uq_suscripciones_push_endpoint_activa
    ON dbo.suscripciones_push(endpoint_hash) WHERE revocada_en IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_suscripciones_push_propietario')
  CREATE INDEX idx_suscripciones_push_propietario
    ON dbo.suscripciones_push(propietario_tipo, propietario_id) WHERE revocada_en IS NULL;
GO

IF OBJECT_ID(N'dbo.notificaciones_push', N'U') IS NULL
  CREATE TABLE dbo.notificaciones_push (
    id                    bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    permiso_id            nvarchar(450) NOT NULL REFERENCES dbo.permisos_trabajo(id),
    tipo_permiso_slug     nvarchar(100) NOT NULL,
    clave_firma           nvarchar(100) NULL,                 -- paso pendiente; NULL en avisos al solicitante
    destinatario_tipo     nvarchar(30) NOT NULL CHECK (destinatario_tipo IN (N'EMPLEADO', N'USUARIO_PROVEEDOR')),
    destinatario_id       nvarchar(450) NOT NULL,
    tipo                  nvarchar(20) NOT NULL CHECK (tipo IN (N'PENDIENTE', N'RECORDATORIO', N'AVANCE', N'RESULTADO')),
    titulo                nvarchar(300) NOT NULL,
    mensaje               nvarchar(1000) NOT NULL,
    url                   nvarchar(1000) NOT NULL,
    estatus               nvarchar(20) NOT NULL CHECK (estatus IN (N'ENVIADA', N'FALLIDA', N'SIN_SUSCRIPCION')),
    dispositivos_enviados int NOT NULL DEFAULT 0,
    dispositivos_fallidos int NOT NULL DEFAULT 0,
    error                 nvarchar(2000) NULL,
    enviada_en            datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_notificaciones_push_permiso')
  CREATE INDEX idx_notificaciones_push_permiso
    ON dbo.notificaciones_push(permiso_id, clave_firma, destinatario_id);
GO

IF OBJECT_ID(N'dbo.tareas_programadas', N'U') IS NULL
  CREATE TABLE dbo.tareas_programadas (
    nombre            nvarchar(100) NOT NULL PRIMARY KEY,
    bloqueada_hasta   datetimeoffset(3) NOT NULL,
    instancia         nvarchar(200) NOT NULL
  );
GO

CREATE OR ALTER TRIGGER dbo.trg_notificaciones_push_inmutables ON dbo.notificaciones_push
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  DECLARE @msg nvarchar(2048) = CONCAT(N'notificaciones_push es de solo anexar: no se permite ',
                                       CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN N'UPDATE' ELSE N'DELETE' END);
  THROW 50000, @msg, 1;
END
GO

CREATE OR ALTER TRIGGER dbo.trg_suscripciones_push_sin_borrado ON dbo.suscripciones_push
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'suscripciones_push no admite borrado: revocar en su lugar', 1;
END
GO
