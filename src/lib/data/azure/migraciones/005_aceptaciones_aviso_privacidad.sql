/*
  Aviso de privacidad (LFPDPPP): evidencia de aceptación por persona y versión del aviso.
  Tabla de solo anexar (trigger de inmutabilidad). Idempotente: esquema.sql ya la trae.
*/

IF OBJECT_ID(N'dbo.aceptaciones_aviso_privacidad', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.aceptaciones_aviso_privacidad (
    id              bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    actor_tipo      nvarchar(30)  NOT NULL CHECK (actor_tipo IN (N'EMPLEADO', N'USUARIO_PROVEEDOR')),
    actor_id        nvarchar(450) NOT NULL,           -- '204692' | 'P-17'
    version_aviso   nvarchar(100) NOT NULL,
    hash_aviso      nvarchar(64)  NOT NULL,           -- sha256 del texto aceptado
    aceptado_en     datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    direccion_ip    nvarchar(100) NOT NULL,
    agente_usuario  nvarchar(500) NOT NULL,
    CONSTRAINT aceptaciones_aviso_actor_version_key UNIQUE (actor_id, version_aviso)
  );
END;
GO

IF OBJECT_ID(N'dbo.trg_aceptaciones_aviso_inmutables', N'TR') IS NULL
EXEC (N'
CREATE TRIGGER dbo.trg_aceptaciones_aviso_inmutables ON dbo.aceptaciones_aviso_privacidad
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  DECLARE @msg nvarchar(2048) = CONCAT(N''aceptaciones_aviso_privacidad es de solo anexar: no se permite '',
                                       CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN N''UPDATE'' ELSE N''DELETE'' END);
  THROW 50000, @msg, 1;
END');
GO
