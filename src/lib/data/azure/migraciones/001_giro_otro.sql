-- Giro "Otro" del autorregistro de proveedores: columna con el texto que escribe el proveedor y el tipo
-- 'OTRO' en el catálogo. Idempotente: esquema.sql ya los trae, así que en una BD nueva no hace nada.

IF COL_LENGTH(N'dbo.proveedores', N'giro_otro') IS NULL
  ALTER TABLE dbo.proveedores ADD giro_otro nvarchar(300) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.tipos_contratista WHERE codigo = N'OTRO')
  INSERT INTO dbo.tipos_contratista (codigo, nombre) VALUES (N'OTRO', N'Otro');
GO
