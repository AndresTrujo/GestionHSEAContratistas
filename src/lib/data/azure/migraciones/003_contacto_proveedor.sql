-- Responsable del autorregistro de proveedores: con su nombre se crea la cuenta administradora al aprobar.
-- Idempotente: esquema.sql ya trae las columnas.

IF COL_LENGTH(N'dbo.proveedores', N'contacto_nombre') IS NULL
  ALTER TABLE dbo.proveedores ADD contacto_nombre nvarchar(300) NULL;
GO

IF COL_LENGTH(N'dbo.proveedores', N'contacto_apellido_paterno') IS NULL
  ALTER TABLE dbo.proveedores ADD contacto_apellido_paterno nvarchar(300) NULL;
GO

IF COL_LENGTH(N'dbo.proveedores', N'contacto_apellido_materno') IS NULL
  ALTER TABLE dbo.proveedores ADD contacto_apellido_materno nvarchar(300) NULL;
GO
