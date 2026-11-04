-- =====================================================================
-- Plataforma de gestión digital HSEA — Esquema T-SQL (Azure SQL Server)
-- Módulos: organización (líneas de mando, departamentos, empleados),
--          cargos de área (gerentes / encargados), roles y permisos,
--          capacitaciones, contratistas (proveedores, personal, equipos,
--          documentos con semáforo), firmas de permisos y auditoría.
-- Origen de la estructura de organización: Capacitacion_Master_v5.xlsx
-- Convención: tablas y columnas en español snake_case.
--
-- Port del esquema PostgreSQL (railway/esquema.sql). Ya incluye todo lo que
-- añadían las 11 migraciones de Railway (001..011); no hay nada que arrastrar.
-- Las futuras migraciones irán en azure/migraciones/NNN_nombre.sql.
--
-- EJECUCIÓN
--   * Es idempotente SOLO en una BD vacía (CREATE sin IF NOT EXISTS, seed sin
--     ON CONFLICT). No lo vuelvas a correr sobre una BD ya creada.
--   * Los lotes se separan con líneas `GO` (el script de carga las divide).
--     No hay BEGIN TRAN global.
--   * Requiere SET ANSI_NULLS ON y QUOTED_IDENTIFIER ON (índices filtrados,
--     vistas y triggers): se fijan al inicio; la conexión los conserva entre lotes.
--
-- TABLAS CON TRIGGERS (cualquier acción) -> NO usar OUTPUT sin INTO sobre ellas
-- (error 334); usar INSERT/UPDATE seguido de SELECT por SCOPE_IDENTITY() o por clave:
--   empleados, empleado_roles, cargos_area, roles, proveedores,
--   empleados_proveedor, equipos_proveedor, usuarios_proveedor,
--   credenciales_firma, documentos_contratista, versiones_documento,
--   revisiones_documento, revocaciones_revision, permisos_trabajo,
--   permiso_participantes, registros_ingreso, firmas_permiso,
--   eventos_auditoria, registro_servidor.
-- Sin triggers: lineas_mando, departamentos, subdepartamentos,
--   reglas_departamentos_rh, permisos, rol_permisos, cursos, rol_cursos_requeridos,
--   estados_capacitacion, capacitaciones, tipos_contratista,
--   proveedor_tipos_contratista, tipos_trabajo, empleado_proveedor_trabajos,
--   tipos_documento, fotos_colaborador,
--   contadores_folio, roles_firma.
--
-- Identidad del actor (auditoría, firmas, columnas *_por de contratistas):
--   * Empleado TFS        -> no_empleado como texto, p.ej. '204692'
--   * Usuario de proveedor-> 'P-' + usuarios_proveedor.id, p.ej. 'P-17'
--   El prefijo evita colisiones entre ambos espacios de numeración.
--   Las tablas de organización/roles solo las modifican empleados, por eso
--   conservan creado_por/actualizado_por como int (no_empleado).
--
-- Trazabilidad: toda mutación debe registrar un evento en
--   eventos_auditoria (append-only) dentro de la misma transacción.
--
-- ZONA HORARIA: todas las marcas de tiempo son datetimeoffset(3) con
--   SYSDATETIMEOFFSET() (instante absoluto). Toda fecha "de hoy" usa
--   dbo.hoy_mx() (America/Mexico_City = 'Central Standard Time (Mexico)'),
--   nunca GETDATE()/SYSDATETIME()/CAST(... AS date) a secas (dependen de la
--   zona del servidor, que en Azure es UTC). De fecha local a instante:
--   CAST(@fecha AS datetime2) AT TIME ZONE 'Central Standard Time (Mexico)'.
--
-- CASCADAS: ninguna FK usa ON DELETE CASCADE / SET NULL. Todas son NO ACTION
--   (equivale al RESTRICT de PostgreSQL), así SQL Server no puede rechazar el
--   esquema por "múltiples rutas en cascada" y, además, nada se borra por
--   arrastre (la trazabilidad exige dar de baja o revocar, no borrar).
--
-- TIPOS (ver CONVENCIONES_AZURE): text clave -> nvarchar(450) (o nvarchar(100)
--   donde la clave entra en un índice compuesto, por el límite de 1700 bytes);
--   text libre -> nvarchar(max); boolean -> bit; jsonb -> nvarchar(max) con
--   CHECK (ISJSON(col) = 1); timestamptz -> datetimeoffset(3).
-- Las restricciones UNIQUE llevan nombre explícito estilo PostgreSQL
--   (<tabla>_<columna>_key; excepción: uq_empleados_proveedor_nss/_curp): los repos comparan el texto del error con él.
-- =====================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------
-- 0. FUNCIONES BASE
-- ---------------------------------------------------------------------

-- Fecha de hoy en America/Mexico_City (Windows: 'Central Standard Time (Mexico)').
CREATE FUNCTION dbo.hoy_mx()
RETURNS date
AS
BEGIN
  RETURN CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Central Standard Time (Mexico)' AS date);
END
GO

-- ---------------------------------------------------------------------
-- 1. ORGANIZACIÓN
--    Líneas de mando y departamentos son estables (ids fijos del Excel).
--    Subdepartamentos sí pueden crecer: id IDENTITY. El seed con ids
--    explícitos se carga con SET IDENTITY_INSERT ON; SQL Server ajusta solo
--    el siguiente valor al máximo cargado (no hace falta setval).
-- ---------------------------------------------------------------------

CREATE TABLE dbo.lineas_mando (
  id                  int NOT NULL PRIMARY KEY,
  nombre              nvarchar(450) NOT NULL,
  activa              bit NOT NULL DEFAULT 1,
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por          int NULL,
  actualizado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por     int NULL,
  CONSTRAINT lineas_mando_nombre_key UNIQUE (nombre)
);

CREATE TABLE dbo.departamentos (
  id                  int NOT NULL PRIMARY KEY,
  linea_mando_id      int NOT NULL REFERENCES dbo.lineas_mando(id),
  nombre              nvarchar(450) NOT NULL,
  activo              bit NOT NULL DEFAULT 1,
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por          int NULL,
  actualizado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por     int NULL,
  CONSTRAINT departamentos_nombre_key UNIQUE (nombre)
);
CREATE INDEX idx_departamentos_linea ON dbo.departamentos(linea_mando_id);

-- Solo subdepartamentos reales. El Excel trae un "Sin subdepartamento"
-- por cada departamento: aquí eso se representa con subdepartamento_id NULL.
CREATE TABLE dbo.subdepartamentos (
  id                  int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  departamento_id     int NOT NULL REFERENCES dbo.departamentos(id),
  nombre              nvarchar(450) NOT NULL,
  activo              bit NOT NULL DEFAULT 1,
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por          int NULL,
  actualizado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por     int NULL,
  CONSTRAINT subdepartamentos_departamento_id_nombre_key UNIQUE (departamento_id, nombre),
  CONSTRAINT subdepartamentos_id_departamento_id_key UNIQUE (id, departamento_id)  -- para FK compuesta desde permisos_trabajo
);

CREATE TABLE dbo.empleados (
  no_empleado             int NOT NULL PRIMARY KEY,      -- identidad usada en login y auditoría
  primer_nombre           nvarchar(300) NOT NULL,
  segundo_nombre          nvarchar(300) NULL,
  apellido_paterno        nvarchar(300) NOT NULL,
  apellido_materno        nvarchar(300) NULL,
  genero                  nvarchar(20) NULL CHECK (genero IN (N'MASCULINO', N'FEMENINO')),
  fecha_ingreso           date NOT NULL,
  fecha_baja              date NULL,
  activo                  bit NOT NULL DEFAULT 1,
  puesto                  nvarchar(450) NOT NULL,
  linea_mando_id          int NOT NULL REFERENCES dbo.lineas_mando(id),
  departamento_id         int NOT NULL REFERENCES dbo.departamentos(id),
  subdepartamento_id      int NULL REFERENCES dbo.subdepartamentos(id),
  jefe_no_empleado        int NULL REFERENCES dbo.empleados(no_empleado),
  creado_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por              int NULL,
  actualizado_en          datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por         int NULL,
  -- con fecha_baja => inactivo. (El Excel trae 14 inactivos sin fecha_baja, p.ej. residentes.)
  CHECK (fecha_baja IS NULL OR activo = 0),
  CHECK (jefe_no_empleado IS NULL OR jefe_no_empleado <> no_empleado)
);
CREATE INDEX idx_empleados_departamento ON dbo.empleados(departamento_id);
CREATE INDEX idx_empleados_subdepartamento ON dbo.empleados(subdepartamento_id);
CREATE INDEX idx_empleados_jefe ON dbo.empleados(jefe_no_empleado);
CREATE INDEX idx_empleados_activo ON dbo.empleados(activo);

-- Reglas para clasificar el "departamento RH" (texto libre del sistema de RH)
-- dentro de la estructura de arriba al importar altas/cambios.
CREATE TABLE dbo.reglas_departamentos_rh (
  id                      int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  departamento_rh         nvarchar(450) NOT NULL,
  linea_mando_id          int NOT NULL REFERENCES dbo.lineas_mando(id),
  departamento_id         int NOT NULL REFERENCES dbo.departamentos(id),
  subdepartamento_id      int NULL REFERENCES dbo.subdepartamentos(id),
  origen                  nvarchar(max) NULL,
  creado_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por              int NULL,
  CONSTRAINT reglas_departamentos_rh_departamento_rh_key UNIQUE (departamento_rh)
);

-- ---------------------------------------------------------------------
-- 2. CARGOS DE ÁREA: GERENTES y ENCARGADOS (con vigencia histórica)
--    Reemplaza las columnas NoEmpleadoResponsable del Excel.
--    GERENTE   -> responsable de una línea de mando
--    ENCARGADO -> responsable de un departamento o subdepartamento
--    Pueden existir varios encargados vigentes por área; por diseño NO hay
--    restricción de unicidad por área ni figura de suplente (todos son titulares).
-- ---------------------------------------------------------------------

CREATE TABLE dbo.cargos_area (
  id                  bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  no_empleado         int NOT NULL REFERENCES dbo.empleados(no_empleado),
  cargo               nvarchar(20) NOT NULL CHECK (cargo IN (N'GERENTE', N'ENCARGADO')),
  linea_mando_id      int NULL REFERENCES dbo.lineas_mando(id),
  departamento_id     int NULL REFERENCES dbo.departamentos(id),
  subdepartamento_id  int NULL REFERENCES dbo.subdepartamentos(id),
  vigente_desde       date NOT NULL DEFAULT dbo.hoy_mx(),
  vigente_hasta       date NULL,
  motivo              nvarchar(max) NULL,
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por          int NULL,
  actualizado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por     int NULL,
  -- exactamente un nivel de alcance
  CHECK ((CASE WHEN linea_mando_id IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN departamento_id IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN subdepartamento_id IS NOT NULL THEN 1 ELSE 0 END) = 1),
  -- GERENTE solo a nivel línea; ENCARGADO a departamento o subdepartamento
  CHECK ((cargo = N'GERENTE'   AND linea_mando_id IS NOT NULL)
      OR (cargo = N'ENCARGADO' AND linea_mando_id IS NULL)),
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);
CREATE INDEX idx_cargos_area_empleado ON dbo.cargos_area(no_empleado);
CREATE INDEX idx_cargos_area_vigentes ON dbo.cargos_area(cargo) WHERE vigente_hasta IS NULL;

-- ---------------------------------------------------------------------
-- 3. ROLES Y PERMISOS
--    * Los códigos de permiso son una lista cerrada que vive en código
--      (src/config/permisos.ts) y se sincroniza a esta tabla.
--    * Los roles y sus asignaciones sí viven en BD (cambian sin deploy).
--    * El rol se decide por el PUESTO del empleado; los cursos son
--      opcionales (rol_cursos_requeridos queda vacío por omisión).
-- ---------------------------------------------------------------------

CREATE TABLE dbo.permisos (
  codigo              nvarchar(450) NOT NULL PRIMARY KEY,   -- p.ej. 'firmar:supervisor_hsea'
  descripcion         nvarchar(max) NOT NULL,
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);

CREATE TABLE dbo.roles (
  id                  int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  codigo              nvarchar(450) NOT NULL,               -- p.ej. 'SUPERVISOR_HSEA'
  nombre              nvarchar(450) NOT NULL,
  descripcion         nvarchar(max) NULL,
  es_sistema          bit NOT NULL DEFAULT 0,
  activo              bit NOT NULL DEFAULT 1,               -- los roles se desactivan, no se borran
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por          int NULL,
  actualizado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por     int NULL,
  CONSTRAINT roles_codigo_key UNIQUE (codigo)
);

-- ON DELETE RESTRICT de PostgreSQL == NO ACTION (valor por omisión) en SQL Server.
CREATE TABLE dbo.rol_permisos (
  rol_id              int NOT NULL REFERENCES dbo.roles(id),
  permiso_codigo      nvarchar(450) NOT NULL REFERENCES dbo.permisos(codigo),
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por          int NULL,
  PRIMARY KEY (rol_id, permiso_codigo)
);

CREATE TABLE dbo.cursos (
  id_curso            nvarchar(450) NOT NULL PRIMARY KEY,   -- 'CUR001'
  nombre              nvarchar(450) NOT NULL,
  horas               decimal(5,1) NOT NULL,
  palabras_clave      nvarchar(max) NULL,
  vigencia_meses      int NULL CHECK (vigencia_meses IS NULL OR vigencia_meses > 0), -- NULL = sin caducidad
  activo              bit NOT NULL DEFAULT 1,
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por          int NULL,
  actualizado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por     int NULL
);

-- Cursos que un rol exige tener aprobados (opcional; hoy sin uso).
CREATE TABLE dbo.rol_cursos_requeridos (
  rol_id              int NOT NULL REFERENCES dbo.roles(id),
  id_curso            nvarchar(450) NOT NULL REFERENCES dbo.cursos(id_curso),
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por          int NULL,
  PRIMARY KEY (rol_id, id_curso)
);

-- Asignación de un rol a un empleado, con alcance y vigencia.
-- alcance GLOBAL: toda la organización. LINEA_MANDO / DEPARTAMENTO /
-- SUBDEPARTAMENTO: el rol aplica a esa área y a todo lo que cuelga de ella.
-- Se revoca (revocado_en/por), nunca se borra. Varios empleados pueden
-- tener el mismo rol en la misma área.
CREATE TABLE dbo.empleado_roles (
  id                  bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  no_empleado         int NOT NULL REFERENCES dbo.empleados(no_empleado),
  rol_id              int NOT NULL REFERENCES dbo.roles(id),
  alcance             nvarchar(30) NOT NULL DEFAULT N'GLOBAL'
                      CHECK (alcance IN (N'GLOBAL', N'LINEA_MANDO', N'DEPARTAMENTO', N'SUBDEPARTAMENTO')),
  linea_mando_id      int NULL REFERENCES dbo.lineas_mando(id),
  departamento_id     int NULL REFERENCES dbo.departamentos(id),
  subdepartamento_id  int NULL REFERENCES dbo.subdepartamentos(id),
  vigente_desde       date NOT NULL DEFAULT dbo.hoy_mx(),
  vigente_hasta       date NULL,
  otorgado_por        int NOT NULL REFERENCES dbo.empleados(no_empleado),
  motivo              nvarchar(max) NULL,
  revocado_en         datetimeoffset(3) NULL,
  revocado_por        int NULL REFERENCES dbo.empleados(no_empleado),
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por          int NULL,
  actualizado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por     int NULL,
  CHECK ((alcance = N'GLOBAL'          AND linea_mando_id IS NULL     AND departamento_id IS NULL     AND subdepartamento_id IS NULL)
      OR (alcance = N'LINEA_MANDO'     AND linea_mando_id IS NOT NULL AND departamento_id IS NULL     AND subdepartamento_id IS NULL)
      OR (alcance = N'DEPARTAMENTO'    AND departamento_id IS NOT NULL AND linea_mando_id IS NULL     AND subdepartamento_id IS NULL)
      OR (alcance = N'SUBDEPARTAMENTO' AND subdepartamento_id IS NOT NULL AND linea_mando_id IS NULL  AND departamento_id IS NULL)),
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CHECK ((revocado_en IS NULL AND revocado_por IS NULL) OR (revocado_en IS NOT NULL AND revocado_por IS NOT NULL))
);
CREATE INDEX idx_empleado_roles_empleado ON dbo.empleado_roles(no_empleado) WHERE revocado_en IS NULL;
CREATE INDEX idx_empleado_roles_rol ON dbo.empleado_roles(rol_id) WHERE revocado_en IS NULL;

-- ---------------------------------------------------------------------
-- 4. CAPACITACIONES (de las hojas Estados / Capacitaciones del Excel)
-- ---------------------------------------------------------------------

CREATE TABLE dbo.estados_capacitacion (
  id                  smallint NOT NULL PRIMARY KEY,        -- 0..3
  nombre              nvarchar(450) NOT NULL,
  cuenta_como_aprobada bit NOT NULL DEFAULT 0,
  CONSTRAINT estados_capacitacion_nombre_key UNIQUE (nombre)
);

CREATE TABLE dbo.capacitaciones (
  id                  bigint NOT NULL PRIMARY KEY,          -- IdCapacitacion del Excel
  no_empleado         int NOT NULL REFERENCES dbo.empleados(no_empleado),
  id_curso            nvarchar(450) NOT NULL REFERENCES dbo.cursos(id_curso),
  fecha               date NOT NULL,
  estado_id           smallint NOT NULL REFERENCES dbo.estados_capacitacion(id),
  fuente              nvarchar(max) NULL,                   -- archivo/formulario de origen (trazabilidad)
  creado_en           datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por          int NULL,
  actualizado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por     int NULL
);
CREATE INDEX idx_capacitaciones_empleado_curso ON dbo.capacitaciones(no_empleado, id_curso, fecha DESC);

-- ---------------------------------------------------------------------
-- 5. CONTRATISTAS
--    Una empresa se registra, da de alta a su personal y a sus equipos y
--    sube documentos. HSEA / servicio médico los revisan. El semáforo del
--    personal (ROJO / AMARILLO / VERDE) NO se guarda: se calcula en las
--    vistas v_semaforo_* a partir del estado de los documentos, de modo
--    que un documento vencido regresa solo a ROJO y no puede haber
--    inconsistencias entre semáforo y documentos.
-- ---------------------------------------------------------------------

CREATE TABLE dbo.proveedores (
  id                      int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  razon_social            nvarchar(300) NOT NULL,
  rfc                     nvarchar(450) NOT NULL,
  registro_patronal_imss  nvarchar(450) NULL,
  correo_contacto         nvarchar(450) NOT NULL,
  telefono                nvarchar(100) NULL,
  estatus                 nvarchar(30) NOT NULL DEFAULT N'PENDIENTE_VALIDACION'
                          CHECK (estatus IN (N'PENDIENTE_VALIDACION', N'ACTIVO', N'SUSPENDIDO')),
  giro_otro               nvarchar(300) NULL,               -- giro escrito por el proveedor con el tipo 'OTRO'
  creado_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por              nvarchar(450) NULL,               -- 'AUTOREGISTRO' en el alta inicial
  actualizado_en          datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por         nvarchar(450) NULL,
  CONSTRAINT proveedores_rfc_key UNIQUE (rfc)
);

-- Giro del contratista (catálogo extensible). Un proveedor puede tener varios.
-- Por ahora solo clasifica; no cambia los documentos exigidos.
CREATE TABLE dbo.tipos_contratista (
  codigo                  nvarchar(450) NOT NULL PRIMARY KEY,  -- 'MANTENIMIENTO', 'REDES', ...
  nombre                  nvarchar(450) NOT NULL,
  activo                  bit NOT NULL DEFAULT 1
);

CREATE TABLE dbo.proveedor_tipos_contratista (
  proveedor_id            int NOT NULL REFERENCES dbo.proveedores(id),
  tipo_contratista_codigo nvarchar(450) NOT NULL REFERENCES dbo.tipos_contratista(codigo),
  asignado_en             datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  asignado_por            nvarchar(450) NULL,
  retirado_en             datetimeoffset(3) NULL,           -- se retira, no se borra
  PRIMARY KEY (proveedor_id, tipo_contratista_codigo)
);

-- Trabajos específicos que exigen certificación DC-3 (catálogo extensible).
CREATE TABLE dbo.tipos_trabajo (
  codigo                  nvarchar(450) NOT NULL PRIMARY KEY,  -- 'CALIENTES', 'ALTURAS', 'CONFINADOS'
  nombre                  nvarchar(450) NOT NULL,
  permit_type_slug        nvarchar(450) NULL,               -- slug en src/config/tipos_permiso.ts
  activo                  bit NOT NULL DEFAULT 1
);

CREATE TABLE dbo.empleados_proveedor (
  id                      int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  proveedor_id            int NOT NULL REFERENCES dbo.proveedores(id),
  primer_nombre           nvarchar(300) NOT NULL,
  segundo_nombre          nvarchar(300) NULL,
  apellido_paterno        nvarchar(300) NOT NULL,
  apellido_materno        nvarchar(300) NULL,
  curp                    nvarchar(450) NOT NULL,
  nss                     nvarchar(450) NOT NULL,           -- número de seguridad social IMSS
  puesto                  nvarchar(450) NOT NULL,
  activo                  bit NOT NULL DEFAULT 1,
  fecha_baja              date NULL,
  creado_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por              nvarchar(450) NULL,
  actualizado_en          datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por         nvarchar(450) NULL,
  CONSTRAINT uq_empleados_proveedor_curp UNIQUE (curp),
  CONSTRAINT uq_empleados_proveedor_nss UNIQUE (nss),
  CHECK (fecha_baja IS NULL OR activo = 0)
);
CREATE INDEX idx_empleados_proveedor_proveedor ON dbo.empleados_proveedor(proveedor_id);

-- Trabajos específicos que el colaborador va a realizar; cada uno exige su DC-3.
-- Se retira con retirado_en; no se borra.
CREATE TABLE dbo.empleado_proveedor_trabajos (
  empleado_proveedor_id   int NOT NULL REFERENCES dbo.empleados_proveedor(id),
  tipo_trabajo_codigo     nvarchar(450) NOT NULL REFERENCES dbo.tipos_trabajo(codigo),
  declarado_en            datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  declarado_por           nvarchar(450) NULL,
  retirado_en             datetimeoffset(3) NULL,
  PRIMARY KEY (empleado_proveedor_id, tipo_trabajo_codigo)
);

CREATE TABLE dbo.equipos_proveedor (
  id                      int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  proveedor_id            int NOT NULL REFERENCES dbo.proveedores(id),
  tipo_equipo             nvarchar(450) NOT NULL,           -- 'GRUA', 'MONTACARGAS', ...
  descripcion             nvarchar(max) NULL,
  marca                   nvarchar(450) NULL,
  modelo                  nvarchar(450) NULL,
  numero_serie            nvarchar(450) NULL,
  placas                  nvarchar(450) NULL,
  activo                  bit NOT NULL DEFAULT 1,
  creado_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por              nvarchar(450) NULL,
  actualizado_en          datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por         nvarchar(450) NULL
);
CREATE INDEX idx_equipos_proveedor_proveedor ON dbo.equipos_proveedor(proveedor_id);

-- Cuentas de acceso de proveedores. Si la cuenta pertenece a un colaborador
-- (p.ej. responsable de la tarea que firma), empleado_proveedor_id lo liga.
-- Su actor_id en auditoría/firmas es 'P-' + id.
CREATE TABLE dbo.usuarios_proveedor (
  id                      int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  proveedor_id            int NOT NULL REFERENCES dbo.proveedores(id),
  empleado_proveedor_id   int NULL REFERENCES dbo.empleados_proveedor(id),
  nombre                  nvarchar(300) NOT NULL,
  -- Usuario de acceso de 8 caracteres: 2 letras del nombre + 2 del apellido
  -- paterno + 2 del materno (minúsculas, sin acentos, relleno 'x') + 2 dígitos aleatorios.
  -- El patrón se compara en intercalación binaria para que [a-z] sea estrictamente minúsculas.
  usuario                 nvarchar(450) NOT NULL
                          CHECK (LEN(usuario) = 8 AND usuario COLLATE Latin1_General_100_BIN2 LIKE N'[a-z][a-z][a-z][a-z][a-z][a-z][0-9][0-9]'),
  password_hash           nvarchar(max) NOT NULL,           -- hash con sal (scrypt/argon2); nunca la contraseña
  debe_cambiar_password   bit NOT NULL DEFAULT 1,           -- 1 tras alta o restablecimiento por admin
  intentos_fallidos       smallint NOT NULL DEFAULT 0,
  bloqueado_hasta         datetimeoffset(3) NULL,
  correo                  nvarchar(450) NULL,               -- solo contacto (no hay envío de correos)
  es_administrador        bit NOT NULL DEFAULT 0,
  activo                  bit NOT NULL DEFAULT 1,
  creado_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por              nvarchar(450) NULL,
  actualizado_en          datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por         nvarchar(450) NULL,
  CONSTRAINT usuarios_proveedor_usuario_key UNIQUE (usuario)
);
CREATE INDEX idx_usuarios_proveedor_proveedor ON dbo.usuarios_proveedor(proveedor_id);

-- Catálogo de documentos requeridos.
--  * obligatorio = 1: lo exige a todo el personal / equipo.
--  * tipo_trabajo_codigo NOT NULL: DC-3 del trabajo; se exige solo si el
--    colaborador declaró ese trabajo (empleado_proveedor_trabajos).
--  * vigencia_meses: caducidad contada desde fecha_emision (examen médico 12,
--    inducción 24). Si la versión trae fecha_vencimiento, gana la más próxima.
--  * permiso_revision: permiso que debe tener quien revisa (médico != HSEA).
--  * aplica_a: EMPLEADO / EQUIPO / PROVEEDOR (documento de la empresa, persona moral).
CREATE TABLE dbo.tipos_documento (
  codigo                  nvarchar(450) NOT NULL PRIMARY KEY,
  nombre                  nvarchar(450) NOT NULL,
  aplica_a                nvarchar(20) NOT NULL CHECK (aplica_a IN (N'EMPLEADO', N'EQUIPO', N'PROVEEDOR')),
  categoria               nvarchar(30) NOT NULL CHECK (categoria IN (N'IMSS', N'MEDICO', N'CAPACITACION', N'EPP', N'CERTIFICACION')),
  obligatorio             bit NOT NULL DEFAULT 1,
  vigencia_meses          int NULL CHECK (vigencia_meses IS NULL OR vigencia_meses > 0),
  tipo_trabajo_codigo     nvarchar(450) NULL REFERENCES dbo.tipos_trabajo(codigo),
  permiso_revision        nvarchar(450) NOT NULL REFERENCES dbo.permisos(codigo),
  activo                  bit NOT NULL DEFAULT 1,
  CHECK (tipo_trabajo_codigo IS NULL OR (aplica_a = N'EMPLEADO' AND obligatorio = 0))
);

-- Un "expediente" por sujeto y tipo de documento; las versiones cuelgan de él.
CREATE TABLE dbo.documentos_contratista (
  id                      bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  empleado_proveedor_id   int NULL REFERENCES dbo.empleados_proveedor(id),
  equipo_proveedor_id     int NULL REFERENCES dbo.equipos_proveedor(id),
  proveedor_id            int NULL REFERENCES dbo.proveedores(id),   -- documentos de la empresa (persona moral)
  tipo_documento_codigo   nvarchar(450) NOT NULL REFERENCES dbo.tipos_documento(codigo),
  creado_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por              nvarchar(450) NOT NULL,
  CONSTRAINT documentos_contratista_un_dueno
    CHECK ((CASE WHEN empleado_proveedor_id IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN equipo_proveedor_id IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN proveedor_id IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
-- Índices únicos filtrados (equivalen a los únicos parciales de PostgreSQL).
CREATE UNIQUE INDEX uq_documento_proveedor
  ON dbo.documentos_contratista(proveedor_id, tipo_documento_codigo) WHERE proveedor_id IS NOT NULL;
CREATE UNIQUE INDEX uq_documento_empleado
  ON dbo.documentos_contratista(empleado_proveedor_id, tipo_documento_codigo) WHERE empleado_proveedor_id IS NOT NULL;
CREATE UNIQUE INDEX uq_documento_equipo
  ON dbo.documentos_contratista(equipo_proveedor_id, tipo_documento_codigo) WHERE equipo_proveedor_id IS NOT NULL;

-- Versiones inmutables: una resubida crea numero_version + 1; las anteriores se conservan.
CREATE TABLE dbo.versiones_documento (
  id                      bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  documento_id            bigint NOT NULL REFERENCES dbo.documentos_contratista(id),
  numero_version          int NOT NULL CHECK (numero_version > 0),
  nombre_archivo          nvarchar(max) NOT NULL,
  tipo_mime               nvarchar(450) NOT NULL,
  tamano_bytes            bigint NOT NULL CHECK (tamano_bytes > 0),
  -- Política de privacidad: el archivo (con datos personales) solo sirve para
  -- validar; 15 días después de aprobado se elimina del almacenamiento y esta
  -- ruta pasa a NULL. Se conservan sha256, fechas y la revisión (trazabilidad).
  ruta_almacenamiento     nvarchar(max) NULL,
  archivo_eliminado_en    datetimeoffset(3) NULL,
  archivo_eliminado_por   nvarchar(450) NULL,               -- 'SISTEMA' en la purga automática
  sha256                  nvarchar(64) NOT NULL
                          CHECK (LEN(sha256) = 64 AND sha256 COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^0-9a-f]%'),
  fecha_emision           date NULL,
  fecha_vencimiento       date NULL,
  subido_por              nvarchar(450) NOT NULL,
  subido_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT versiones_documento_documento_id_numero_version_key UNIQUE (documento_id, numero_version),
  CHECK (fecha_vencimiento IS NULL OR fecha_emision IS NULL OR fecha_vencimiento >= fecha_emision),
  CHECK ((ruta_almacenamiento IS NULL AND archivo_eliminado_en IS NOT NULL)
      OR (ruta_almacenamiento IS NOT NULL AND archivo_eliminado_en IS NULL))
);

-- Revisión de una versión (una sola; si se rechaza, el proveedor sube otra versión).
CREATE TABLE dbo.revisiones_documento (
  id                      bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  version_id              bigint NOT NULL REFERENCES dbo.versiones_documento(id),
  resultado               nvarchar(20) NOT NULL CHECK (resultado IN (N'APROBADO', N'RECHAZADO')),
  revisor_no_empleado     int NOT NULL REFERENCES dbo.empleados(no_empleado),
  motivo                  nvarchar(max) NULL,
  revisado_en             datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT revisiones_documento_version_id_key UNIQUE (version_id),
  CHECK (resultado = N'APROBADO' OR motivo IS NOT NULL)
);

-- Revocación de una aprobación (error humano): la revisión original no se toca; la revocación se anexa
-- aparte. La versión revocada queda como REVOCADO (semáforo ROJO) y el proveedor debe subir otra.
CREATE TABLE dbo.revocaciones_revision (
  revision_id             bigint NOT NULL PRIMARY KEY REFERENCES dbo.revisiones_documento(id),
  revocado_por            int NOT NULL REFERENCES dbo.empleados(no_empleado),
  motivo                  nvarchar(max) NOT NULL CHECK (LEN(LTRIM(RTRIM(motivo))) > 0),
  revocado_en             datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);

-- Fotografía del colaborador para la pantalla de acceso a planta (QR). Cada foto nueva es una fila; el archivo
-- puede eliminarse a mano (ruta NULL). No participa en el semáforo.
CREATE TABLE dbo.fotos_colaborador (
  id                      bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  empleado_proveedor_id   int NOT NULL REFERENCES dbo.empleados_proveedor(id),
  nombre_archivo          nvarchar(max) NOT NULL,
  tipo_mime               nvarchar(100) NOT NULL CHECK (tipo_mime IN (N'image/jpeg', N'image/png')),
  tamano_bytes            bigint NOT NULL CHECK (tamano_bytes > 0),
  ruta_almacenamiento     nvarchar(max) NULL,
  archivo_eliminado_en    datetimeoffset(3) NULL,
  archivo_eliminado_por   nvarchar(450) NULL,
  sha256                  nvarchar(64) NOT NULL
                          CHECK (LEN(sha256) = 64 AND sha256 COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^0-9a-f]%'),
  subido_por              nvarchar(450) NOT NULL,
  subido_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CHECK ((ruta_almacenamiento IS NULL AND archivo_eliminado_en IS NOT NULL)
      OR (ruta_almacenamiento IS NOT NULL AND archivo_eliminado_en IS NULL))
);
CREATE INDEX idx_fotos_colaborador_empleado ON dbo.fotos_colaborador(empleado_proveedor_id, id DESC);

-- ---------------------------------------------------------------------
-- 6. PERMISOS DE TRABAJO
--    Columnas fijas para lo que se consulta/filtra y `campos` (JSON) para
--    lo propio de cada formato (src/config/*). El catálogo de tipos vive
--    en código (src/config/tipos_permiso.ts), por eso el slug es texto.
--    Los valores de `estatus` son los de PermitStatus en src/domain/permisos.ts.
--    El área (departamento_id) es obligatoria: NOT NULL cubre la migración 007.
-- ---------------------------------------------------------------------

-- Consecutivo por tipo y año; se reinicia solo al cambiar el año (dbo.hoy_mx()).
-- tipo_permiso_slug es nvarchar(100) (no 450) para que los índices compuestos con la PK de
-- permisos_trabajo (nvarchar(450)) no superen los 1700 bytes de clave.
CREATE TABLE dbo.contadores_folio (
  tipo_permiso_slug   nvarchar(100) NOT NULL,
  anio                smallint NOT NULL,
  ultimo              int NOT NULL,
  PRIMARY KEY (tipo_permiso_slug, anio)
);

CREATE TABLE dbo.permisos_trabajo (
  id                        nvarchar(450) NOT NULL PRIMARY KEY,
  tipo_permiso_slug         nvarchar(100) NOT NULL,
  anio                      smallint NOT NULL,
  consecutivo               int NOT NULL,
  folio                     nvarchar(100) NOT NULL,
  estatus                   nvarchar(20) NOT NULL DEFAULT N'draft'
                            CHECK (estatus IN (N'draft', N'submitted', N'approved', N'rejected', N'closed')),
  solicitante_tipo          nvarchar(30) NOT NULL CHECK (solicitante_tipo IN (N'EMPLEADO', N'USUARIO_PROVEEDOR')),
  solicitante_no_empleado   int NULL REFERENCES dbo.empleados(no_empleado),
  solicitante_usuario_proveedor_id int NULL REFERENCES dbo.usuarios_proveedor(id),
  proveedor_id              int NULL REFERENCES dbo.proveedores(id),  -- si lo ejecuta un contratista
  -- Área del permiso (alcance de las firmas): los seis formatos la piden con un selector.
  departamento_id           int NOT NULL REFERENCES dbo.departamentos(id),
  subdepartamento_id        int NULL,
  campos                    nvarchar(max) NOT NULL DEFAULT N'{}' CHECK (ISJSON(campos) = 1),
  -- Solo los pasos que NO son un rol de firma (solicitante, verificaciones, revalidación, participantes
  -- del JSA): clave, firmante, fecha y trazo. Las firmas de rol viven únicamente en firmas_permiso.
  firmas_formato            nvarchar(max) NOT NULL DEFAULT N'[]' CHECK (ISJSON(firmas_formato) = 1 AND LEFT(LTRIM(firmas_formato), 1) = N'['),
  creado_en                 datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por                nvarchar(450) NOT NULL,
  actualizado_en            datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actualizado_por           nvarchar(450) NOT NULL,
  CONSTRAINT permisos_trabajo_folio_key UNIQUE (folio),
  CONSTRAINT permisos_trabajo_tipo_permiso_slug_anio_consecutivo_key UNIQUE (tipo_permiso_slug, anio, consecutivo),
  -- el subdepartamento debe pertenecer al departamento (no se evalúa si es NULL)
  FOREIGN KEY (subdepartamento_id, departamento_id)
    REFERENCES dbo.subdepartamentos (id, departamento_id),
  CHECK ((solicitante_tipo = N'EMPLEADO'          AND solicitante_no_empleado IS NOT NULL AND solicitante_usuario_proveedor_id IS NULL)
      OR (solicitante_tipo = N'USUARIO_PROVEEDOR' AND solicitante_usuario_proveedor_id IS NOT NULL AND solicitante_no_empleado IS NULL))
);
CREATE INDEX idx_permisos_tipo_estatus ON dbo.permisos_trabajo(tipo_permiso_slug, estatus);
CREATE INDEX idx_permisos_departamento ON dbo.permisos_trabajo(departamento_id);
CREATE INDEX idx_permisos_proveedor ON dbo.permisos_trabajo(proveedor_id) WHERE proveedor_id IS NOT NULL;

-- Personas que participan en un permiso (ejecutores, etc.): empleados TFS o
-- personal de un proveedor. El personal de proveedor debe estar en VERDE
-- al agregarlo. Se retira (retirado_en), no se borra.
CREATE TABLE dbo.permiso_participantes (
  id                      bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  permiso_id              nvarchar(450) NOT NULL REFERENCES dbo.permisos_trabajo(id),
  funcion                 nvarchar(450) NOT NULL,           -- p.ej. 'executor'
  posicion                smallint NOT NULL DEFAULT 1,
  participante_tipo       nvarchar(30) NOT NULL CHECK (participante_tipo IN (N'EMPLEADO', N'EMPLEADO_PROVEEDOR')),
  no_empleado             int NULL REFERENCES dbo.empleados(no_empleado),
  empleado_proveedor_id   int NULL REFERENCES dbo.empleados_proveedor(id),
  nombre_registrado       nvarchar(300) NOT NULL,           -- nombre al momento de registrarlo
  creado_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  creado_por              nvarchar(450) NOT NULL,
  retirado_en             datetimeoffset(3) NULL,
  CHECK ((participante_tipo = N'EMPLEADO'           AND no_empleado IS NOT NULL AND empleado_proveedor_id IS NULL)
      OR (participante_tipo = N'EMPLEADO_PROVEEDOR' AND empleado_proveedor_id IS NOT NULL AND no_empleado IS NULL))
);
CREATE INDEX idx_participantes_permiso ON dbo.permiso_participantes(permiso_id);

-- ---------------------------------------------------------------------
-- 7. BITÁCORA DE INGRESOS A PLANTA (personal de proveedores)
--    Cada ingreso registra la verificación de EPP completo y el semáforo
--    real en ese momento (lo fija un trigger a partir de la vista; un
--    ingreso PERMITIDO solo es válido en VERDE y con EPP completo).
--    Es histórica: la única modificación permitida es registrar la salida.
-- ---------------------------------------------------------------------

CREATE TABLE dbo.registros_ingreso (
  id                        bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  empleado_proveedor_id     int NOT NULL REFERENCES dbo.empleados_proveedor(id),
  ingreso_en                datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  resultado                 nvarchar(20) NOT NULL CHECK (resultado IN (N'PERMITIDO', N'DENEGADO')),
  semaforo_al_ingresar      nvarchar(20) NOT NULL DEFAULT N'ROJO' CHECK (semaforo_al_ingresar IN (N'ROJO', N'AMARILLO', N'VERDE')),
  epp_completo              bit NOT NULL,
  observaciones             nvarchar(max) NULL,
  motivo_denegacion         nvarchar(max) NULL,
  permiso_id                nvarchar(450) NULL REFERENCES dbo.permisos_trabajo(id),
  registrado_por            int NOT NULL REFERENCES dbo.empleados(no_empleado),
  salida_en                 datetimeoffset(3) NULL,
  salida_registrada_por     int NULL REFERENCES dbo.empleados(no_empleado),
  -- Ojo: el CHECK se evalúa con el semáforo que manda el cliente; el trigger trg_ingreso_semaforo
  -- lo vuelve a fijar desde la vista justo después (ver sección de triggers).
  CHECK (resultado = N'DENEGADO' OR (semaforo_al_ingresar = N'VERDE' AND epp_completo = 1)),
  CHECK (resultado = N'PERMITIDO' OR motivo_denegacion IS NOT NULL),
  CHECK (salida_en IS NULL OR (resultado = N'PERMITIDO' AND salida_en >= ingreso_en)),
  CHECK ((salida_en IS NULL AND salida_registrada_por IS NULL)
      OR (salida_en IS NOT NULL AND salida_registrada_por IS NOT NULL))
);
CREATE INDEX idx_ingresos_empleado ON dbo.registros_ingreso(empleado_proveedor_id, ingreso_en DESC);
-- un colaborador no puede tener dos ingresos abiertos a la vez (también ante concurrencia)
CREATE UNIQUE INDEX uq_ingreso_abierto ON dbo.registros_ingreso(empleado_proveedor_id)
  WHERE salida_en IS NULL AND resultado = N'PERMITIDO';

-- ---------------------------------------------------------------------
-- 8. FIRMAS DE PERMISOS DE TRABAJO
--    Los roles de firma son los de los formatos (src/config/*): cada
--    permiso exige UNA firma por rol. La segregación entre personas se
--    valida en la aplicación (can_sign); el ADMIN_HSEA puede firmar varios
--    roles en un mismo permiso (migraciones 011: sin índices únicos por persona).
-- ---------------------------------------------------------------------

-- codigo es nvarchar(100) (no 450) para que UNIQUE (permiso_id, rol_firma) quepa en 1700 bytes.
CREATE TABLE dbo.roles_firma (
  codigo                  nvarchar(100) NOT NULL PRIMARY KEY,   -- clave usada en los formatos
  nombre                  nvarchar(450) NOT NULL,
  -- permiso que debe tener el firmante; NULL = basta con estar autenticado
  permiso_requerido       nvarchar(450) NULL REFERENCES dbo.permisos(codigo),
  activo                  bit NOT NULL DEFAULT 1
);

-- PIN personal de firma (anti suplantación). Solo se guarda el hash con sal
-- (scrypt/argon2, nunca el PIN). Un cambio o reinicio crea una credencial
-- nueva y revoca la anterior: el historial se conserva.
CREATE TABLE dbo.credenciales_firma (
  id                      bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  firmante_tipo           nvarchar(30) NOT NULL CHECK (firmante_tipo IN (N'EMPLEADO', N'USUARIO_PROVEEDOR')),
  no_empleado             int NULL REFERENCES dbo.empleados(no_empleado),
  usuario_proveedor_id    int NULL REFERENCES dbo.usuarios_proveedor(id),
  pin_hash                nvarchar(max) NOT NULL,
  -- El PIN solo lo activa un administrador (sin correo): evita que un tercero
  -- lo establezca primero con un número de empleado ajeno.
  metodo_activacion       nvarchar(20) NOT NULL DEFAULT N'ADMIN' CHECK (metodo_activacion IN (N'ADMIN')),
  activada_por            int NOT NULL REFERENCES dbo.empleados(no_empleado),
  estado                  nvarchar(20) NOT NULL DEFAULT N'ACTIVA' CHECK (estado IN (N'ACTIVA', N'BLOQUEADA', N'REVOCADA')),
  intentos_fallidos       smallint NOT NULL DEFAULT 0,
  bloqueada_hasta         datetimeoffset(3) NULL,
  creado_en               datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  revocada_en             datetimeoffset(3) NULL,
  revocada_por            nvarchar(450) NULL,
  CHECK ((firmante_tipo = N'EMPLEADO'          AND no_empleado IS NOT NULL AND usuario_proveedor_id IS NULL)
      OR (firmante_tipo = N'USUARIO_PROVEEDOR' AND usuario_proveedor_id IS NOT NULL AND no_empleado IS NULL))
);
CREATE UNIQUE INDEX uq_credencial_activa_empleado
  ON dbo.credenciales_firma(no_empleado) WHERE no_empleado IS NOT NULL AND estado <> N'REVOCADA';
CREATE UNIQUE INDEX uq_credencial_activa_proveedor
  ON dbo.credenciales_firma(usuario_proveedor_id) WHERE usuario_proveedor_id IS NOT NULL AND estado <> N'REVOCADA';

CREATE TABLE dbo.firmas_permiso (
  id                      bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  permiso_id              nvarchar(450) NOT NULL REFERENCES dbo.permisos_trabajo(id),
  rol_firma               nvarchar(100) NOT NULL REFERENCES dbo.roles_firma(codigo),
  -- Firmante: empleado TFS o usuario de proveedor (sin número de empleado).
  firmante_tipo           nvarchar(30) NOT NULL CHECK (firmante_tipo IN (N'EMPLEADO', N'USUARIO_PROVEEDOR')),
  no_empleado             int NULL REFERENCES dbo.empleados(no_empleado),
  usuario_proveedor_id    int NULL REFERENCES dbo.usuarios_proveedor(id),
  -- área del permiso al firmar (alcance contra el que se validó)
  linea_mando_id          int NULL REFERENCES dbo.lineas_mando(id),
  departamento_id         int NULL REFERENCES dbo.departamentos(id),
  subdepartamento_id      int NULL REFERENCES dbo.subdepartamentos(id),
  -- foto de autorización
  empleado_rol_id         bigint NULL REFERENCES dbo.empleado_roles(id),
  cargo_area_id           bigint NULL REFERENCES dbo.cargos_area(id),
  credencial_firma_id     bigint NULL REFERENCES dbo.credenciales_firma(id), -- PIN verificado; NULL si no se exige PIN
  nombre_firmante         nvarchar(300) NOT NULL,
  puesto_firmante         nvarchar(450) NOT NULL,
  firmado_en              datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  hash_documento          nvarchar(450) NULL,               -- sha256 del contenido firmado
  -- trazo manuscrito como data URL PNG (máx. ~300 KB); NULL si no se dibujó
  imagen_firma            nvarchar(max) NULL
                          CHECK (imagen_firma IS NULL
                                 OR (imagen_firma LIKE N'data:image/png;base64,%' AND LEN(imagen_firma) <= 300100)),
  CHECK ((firmante_tipo = N'EMPLEADO'          AND no_empleado IS NOT NULL AND usuario_proveedor_id IS NULL)
      OR (firmante_tipo = N'USUARIO_PROVEEDOR' AND usuario_proveedor_id IS NOT NULL AND no_empleado IS NULL)),
  -- un solo firmante por rol en cada permiso
  CONSTRAINT firmas_permiso_permiso_id_rol_firma_key UNIQUE (permiso_id, rol_firma)
);
CREATE INDEX idx_firmas_permiso ON dbo.firmas_permiso(permiso_id);

-- ---------------------------------------------------------------------
-- 9. AUDITORÍA (append-only). Mismos valores que src/domain/auditoria.ts.
--    La lista de acciones incluye 'descargar_documento' (mig. 001) y
--    'revocar_revision' (mig. 005).
-- ---------------------------------------------------------------------

-- entidad es nvarchar(128) (nombre de tabla) para que el índice (entidad, entidad_id) quepa en 1700 bytes.
CREATE TABLE dbo.eventos_auditoria (
  id                  bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  ocurrido_en         datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  actor_tipo          nvarchar(30) NOT NULL CHECK (actor_tipo IN (N'EMPLEADO', N'USUARIO_PROVEEDOR', N'SISTEMA')),
  actor_id            nvarchar(450) NOT NULL,               -- '204692' | 'P-17' | 'AUTOREGISTRO' | 'PURGA'
  accion              nvarchar(50) NOT NULL CHECK (accion IN (
                        N'crear', N'actualizar', N'eliminar', N'firmar',
                        N'subir_version', N'aprobar_revision', N'rechazar_revision', N'revocar_revision',
                        N'asignar_rol', N'revocar_rol',
                        N'establecer_pin', N'verificar_pin_fallido', N'revocar_pin',
                        N'restablecer_password', N'purgar_archivo', N'descargar_documento',
                        N'iniciar_sesion', N'inicio_sesion_fallido', N'cerrar_sesion')),
  entidad             nvarchar(128) NOT NULL,               -- nombre de tabla, p.ej. 'permisos_trabajo'
  entidad_id          nvarchar(450) NOT NULL,
  detalles            nvarchar(max) NOT NULL DEFAULT N'{}' CHECK (ISJSON(detalles) = 1), -- contexto / antes y después
  -- Formato del actor (patrones en intercalación binaria, equivalentes a las regex de PostgreSQL):
  --   EMPLEADO ^[0-9]+$ | USUARIO_PROVEEDOR ^P-[0-9]+$ | SISTEMA ^[A-Z_]+$
  CHECK ((actor_tipo = N'EMPLEADO' AND LEN(actor_id) > 0
            AND actor_id COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^0-9]%')
      OR (actor_tipo = N'USUARIO_PROVEEDOR' AND LEN(actor_id) > 2
            AND actor_id COLLATE Latin1_General_100_BIN2 LIKE N'P-[0-9]%'
            AND SUBSTRING(actor_id, 3, 450) COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^0-9]%')
      OR (actor_tipo = N'SISTEMA' AND LEN(actor_id) > 0
            AND actor_id COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^A-Z_]%'))
);
CREATE INDEX idx_auditoria_entidad ON dbo.eventos_auditoria(entidad, entidad_id);
CREATE INDEX idx_auditoria_actor ON dbo.eventos_auditoria(actor_tipo, actor_id, ocurrido_en DESC);

-- Registro técnico del servidor (errores, avisos); aparte de la auditoría de personas. Solo se agrega.
CREATE TABLE dbo.registro_servidor (
  id                  bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  ocurrido_en         datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  nivel               nvarchar(10) NOT NULL CHECK (nivel IN (N'ERROR', N'WARN', N'INFO')),
  origen              nvarchar(450) NOT NULL,
  mensaje             nvarchar(max) NOT NULL,
  detalle             nvarchar(max) NULL,
  contexto            nvarchar(max) NOT NULL DEFAULT N'{}' CHECK (ISJSON(contexto) = 1)
);
CREATE INDEX idx_registro_servidor_nivel ON dbo.registro_servidor(nivel, ocurrido_en DESC);
GO

-- ---------------------------------------------------------------------
-- 10. VISTAS Y FUNCIONES DE AUTORIZACIÓN
--     Orden: vistas base -> funciones que las usan -> vistas dependientes.
-- ---------------------------------------------------------------------

-- Cada área (nivel más fino) con sus ancestros, para resolver alcances.
CREATE VIEW dbo.v_areas AS
  SELECT s.id AS subdepartamento_id, d.id AS departamento_id, d.linea_mando_id
    FROM dbo.subdepartamentos s JOIN dbo.departamentos d ON d.id = s.departamento_id
  UNION ALL
  SELECT CAST(NULL AS int), d.id, d.linea_mando_id FROM dbo.departamentos d;
GO

-- Roles vigentes de empleados ACTIVOS (revocados o vencidos excluidos).
CREATE VIEW dbo.v_roles_vigentes AS
  SELECT er.*, r.codigo AS rol_codigo
    FROM dbo.empleado_roles er
    JOIN dbo.roles r     ON r.id = er.rol_id AND r.activo = 1
    JOIN dbo.empleados e ON e.no_empleado = er.no_empleado AND e.activo = 1
   WHERE er.revocado_en IS NULL
     AND er.vigente_desde <= dbo.hoy_mx()
     AND (er.vigente_hasta IS NULL OR er.vigente_hasta >= dbo.hoy_mx());
GO

-- Permisos efectivos por empleado y alcance (un renglón por permiso+asignación).
CREATE VIEW dbo.v_permisos_empleado AS
  SELECT v.no_empleado, rp.permiso_codigo, v.rol_codigo, v.id AS empleado_rol_id,
         v.alcance, v.linea_mando_id, v.departamento_id, v.subdepartamento_id
    FROM dbo.v_roles_vigentes v
    JOIN dbo.rol_permisos rp ON rp.rol_id = v.rol_id;
GO

-- Cargos de área vigentes de empleados activos.
CREATE VIEW dbo.v_cargos_vigentes AS
  SELECT c.*
    FROM dbo.cargos_area c
    JOIN dbo.empleados e ON e.no_empleado = c.no_empleado AND e.activo = 1
   WHERE c.vigente_desde <= dbo.hoy_mx()
     AND (c.vigente_hasta IS NULL OR c.vigente_hasta >= dbo.hoy_mx());
GO

-- ¿Puede el empleado ejercer el permiso en el área dada? -> bit (1/0)
-- @subdepartamento_id puede ser NULL (área = departamento completo); se pasa siempre.
-- Un alcance cubre el área si es GLOBAL o si coincide con ella o con un ancestro.
CREATE FUNCTION dbo.tiene_permiso(
  @no_empleado        int,
  @permiso            nvarchar(450),
  @departamento_id    int,
  @subdepartamento_id int
) RETURNS bit
AS
BEGIN
  RETURN CASE WHEN EXISTS (
    SELECT 1
      FROM dbo.v_permisos_empleado pe
      JOIN dbo.departamentos d ON d.id = @departamento_id
     WHERE pe.no_empleado = @no_empleado
       AND pe.permiso_codigo = @permiso
       AND (pe.alcance = N'GLOBAL'
         OR (pe.alcance = N'LINEA_MANDO'     AND pe.linea_mando_id = d.linea_mando_id)
         OR (pe.alcance = N'DEPARTAMENTO'    AND pe.departamento_id = @departamento_id)
         OR (pe.alcance = N'SUBDEPARTAMENTO' AND pe.subdepartamento_id = @subdepartamento_id))
  ) THEN 1 ELSE 0 END;
END
GO

-- ¿Cumple el empleado los cursos que el rol exige? (aprobado y, si el curso
-- tiene vigencia_meses, dentro de vigencia). Sin cursos requeridos => 1. -> bit
CREATE FUNCTION dbo.cumple_cursos_rol(@no_empleado int, @rol_id int)
RETURNS bit
AS
BEGIN
  RETURN CASE WHEN NOT EXISTS (
    SELECT 1
      FROM dbo.rol_cursos_requeridos rc
      JOIN dbo.cursos c ON c.id_curso = rc.id_curso
     WHERE rc.rol_id = @rol_id
       AND NOT EXISTS (
         SELECT 1
           FROM dbo.capacitaciones k
           JOIN dbo.estados_capacitacion es ON es.id = k.estado_id AND es.cuenta_como_aprobada = 1
          WHERE k.no_empleado = @no_empleado
            AND k.id_curso = rc.id_curso
            AND (c.vigencia_meses IS NULL
                 OR k.fecha >= DATEADD(MONTH, -c.vigencia_meses, dbo.hoy_mx()))
       )
  ) THEN 1 ELSE 0 END;
END
GO

-- Estado vigente de cada documento (última versión + su revisión):
--   EN_REVISION | APROBADO | RECHAZADO | REVOCADO | VENCIDO
-- vigente_hasta = la más próxima entre fecha_vencimiento de la versión y
-- fecha_emision + vigencia_meses del tipo (sin fecha_emision, la de subida,
-- en hora de México). LEAST de PostgreSQL ignoraba NULL: se reproduce con CASE.
CREATE VIEW dbo.v_documentos_estado AS
  SELECT d.id AS documento_id, d.empleado_proveedor_id, d.equipo_proveedor_id,
         d.tipo_documento_codigo, v.id AS version_id, v.numero_version,
         r.resultado AS resultado_revision, vig.vigente_hasta,
         CASE WHEN rv.revision_id IS NOT NULL             THEN N'REVOCADO'
              WHEN r.resultado = N'RECHAZADO'             THEN N'RECHAZADO'
              WHEN vig.vigente_hasta < dbo.hoy_mx()       THEN N'VENCIDO'
              WHEN r.resultado = N'APROBADO'              THEN N'APROBADO'
              ELSE N'EN_REVISION' END AS estado,
         d.proveedor_id
    FROM dbo.documentos_contratista d
    JOIN dbo.tipos_documento td ON td.codigo = d.tipo_documento_codigo
    CROSS APPLY (SELECT TOP (1) x.*
                   FROM dbo.versiones_documento x
                  WHERE x.documento_id = d.id
                  ORDER BY x.numero_version DESC) v
    LEFT JOIN dbo.revisiones_documento r ON r.version_id = v.id
    LEFT JOIN dbo.revocaciones_revision rv ON rv.revision_id = r.id
    CROSS APPLY (
      SELECT CASE WHEN td.vigencia_meses IS NULL THEN CAST(NULL AS date)
                  ELSE DATEADD(MONTH, td.vigencia_meses,
                               COALESCE(v.fecha_emision,
                                        CAST(v.subido_en AT TIME ZONE 'Central Standard Time (Mexico)' AS date)))
             END AS por_tipo
    ) calc
    CROSS APPLY (
      SELECT CASE WHEN v.fecha_vencimiento IS NULL THEN calc.por_tipo
                  WHEN calc.por_tipo IS NULL THEN v.fecha_vencimiento
                  WHEN v.fecha_vencimiento <= calc.por_tipo THEN v.fecha_vencimiento
                  ELSE calc.por_tipo END AS vigente_hasta
    ) vig;
GO

-- Requisitos de cada colaborador activo: los obligatorios + el DC-3 de cada
-- trabajo específico declarado + los documentos del proveedor (persona moral).
-- Sin documento => FALTANTE.
CREATE VIEW dbo.v_requisitos_empleado_proveedor AS
  SELECT ep.id AS empleado_proveedor_id, td.codigo AS tipo_documento_codigo,
         COALESCE(de.estado, N'FALTANTE') AS estado, de.vigente_hasta
    FROM dbo.empleados_proveedor ep
    JOIN dbo.tipos_documento td
      ON td.aplica_a IN (N'EMPLEADO', N'PROVEEDOR') AND td.activo = 1
     AND (td.obligatorio = 1
          OR EXISTS (SELECT 1 FROM dbo.empleado_proveedor_trabajos t
                      WHERE t.empleado_proveedor_id = ep.id
                        AND t.retirado_en IS NULL
                        AND t.tipo_trabajo_codigo = td.tipo_trabajo_codigo))
    LEFT JOIN dbo.v_documentos_estado de
      ON de.tipo_documento_codigo = td.codigo
     AND ((td.aplica_a = N'EMPLEADO'  AND de.empleado_proveedor_id = ep.id)
          OR (td.aplica_a = N'PROVEEDOR' AND de.proveedor_id = ep.proveedor_id))
   WHERE ep.activo = 1;
GO

-- Semáforo del personal contratista:
--   ROJO     falta, está rechazado o venció algún requisito (o proveedor no ACTIVO)
--   AMARILLO todo cargado, pendiente de revisión / validación médica
--   VERDE    todo aprobado y vigente => puede entrar a planta
-- (bool_or / bool_and de PostgreSQL -> MAX / MIN sobre 1/0)
CREATE VIEW dbo.v_semaforo_empleado_proveedor AS
  SELECT ep.id AS empleado_proveedor_id, ep.proveedor_id,
         CASE WHEN p.estatus <> N'ACTIVO'
                OR MAX(CASE WHEN rq.estado IN (N'FALTANTE', N'RECHAZADO', N'REVOCADO', N'VENCIDO') THEN 1 ELSE 0 END) = 1 THEN N'ROJO'
              WHEN MIN(CASE WHEN rq.estado = N'APROBADO' THEN 1 ELSE 0 END) = 1 THEN N'VERDE'
              ELSE N'AMARILLO' END AS semaforo
    FROM dbo.empleados_proveedor ep
    JOIN dbo.proveedores p ON p.id = ep.proveedor_id
    JOIN dbo.v_requisitos_empleado_proveedor rq ON rq.empleado_proveedor_id = ep.id
   GROUP BY ep.id, ep.proveedor_id, p.estatus;
GO

-- Mismo criterio para equipos (grúas, etc.): documentos obligatorios del equipo.
CREATE VIEW dbo.v_semaforo_equipo_proveedor AS
  SELECT e.id AS equipo_proveedor_id, e.proveedor_id,
         CASE WHEN p.estatus <> N'ACTIVO'
                OR MAX(CASE WHEN COALESCE(de.estado, N'FALTANTE') IN (N'FALTANTE', N'RECHAZADO', N'REVOCADO', N'VENCIDO') THEN 1 ELSE 0 END) = 1 THEN N'ROJO'
              WHEN MIN(CASE WHEN de.estado = N'APROBADO' THEN 1 ELSE 0 END) = 1 THEN N'VERDE'
              ELSE N'AMARILLO' END AS semaforo
    FROM dbo.equipos_proveedor e
    JOIN dbo.proveedores p ON p.id = e.proveedor_id
    JOIN dbo.tipos_documento td ON td.aplica_a = N'EQUIPO' AND td.activo = 1 AND td.obligatorio = 1
    LEFT JOIN dbo.v_documentos_estado de
      ON de.equipo_proveedor_id = e.id AND de.tipo_documento_codigo = td.codigo
   WHERE e.activo = 1
   GROUP BY e.id, e.proveedor_id, p.estatus;
GO

-- Archivos que ya cumplieron 15 días desde su aprobación y deben eliminarse del
-- almacenamiento. Flujo del job: borrar el archivo -> UPDATE versiones_documento
-- (ruta NULL, archivo_eliminado_en/por) -> evento 'purgar_archivo' en auditoría.
CREATE VIEW dbo.v_archivos_por_purgar AS
  SELECT v.id AS version_id, v.documento_id, v.ruta_almacenamiento, r.revisado_en
    FROM dbo.versiones_documento v
    JOIN dbo.revisiones_documento r ON r.version_id = v.id AND r.resultado = N'APROBADO'
   WHERE v.archivo_eliminado_en IS NULL
     AND r.revisado_en <= DATEADD(DAY, -15, SYSDATETIMEOFFSET());
GO

-- ---------------------------------------------------------------------
-- 11. PROCEDIMIENTO DE FOLIOS
--     Atómico y sin huecos por concurrencia: UPDLOCK + HOLDLOCK serializa a quienes piden folio
--     (también cuando la fila del año aún no existe: bloqueo de rango). La app arma el texto
--     (p.ej. 'TC-2026-0001') con su prefijo y estos dos números.
--     Uso: EXEC dbo.siguiente_consecutivo @tipo_permiso_slug -> una fila (anio_folio, consecutivo_folio)
-- ---------------------------------------------------------------------

CREATE PROCEDURE dbo.siguiente_consecutivo
  @tipo_permiso_slug nvarchar(100)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @anio smallint = CAST(YEAR(dbo.hoy_mx()) AS smallint);
  DECLARE @ultimo int;
  DECLARE @propia bit = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;

  IF @propia = 1 BEGIN TRANSACTION;

  UPDATE dbo.contadores_folio WITH (UPDLOCK, HOLDLOCK)
     SET @ultimo = ultimo = ultimo + 1
   WHERE tipo_permiso_slug = @tipo_permiso_slug AND anio = @anio;

  IF @@ROWCOUNT = 0
  BEGIN
    INSERT INTO dbo.contadores_folio (tipo_permiso_slug, anio, ultimo)
    VALUES (@tipo_permiso_slug, @anio, 1);
    SET @ultimo = 1;
  END

  IF @propia = 1 COMMIT TRANSACTION;

  SELECT @anio AS anio_folio, @ultimo AS consecutivo_folio;
END
GO

-- ---------------------------------------------------------------------
-- 12. TRIGGERS
--     Los BEFORE de PostgreSQL pasan a AFTER: validan y hacen THROW 50000 (con XACT_ABORT ON la
--     instrucción y la transacción se revierten). Son por conjunto (INSERTED/DELETED).
--     SET NOCOUNT ON en todos para no alterar el conteo de filas que ve el driver.
--     Mensajes idénticos a los de PostgreSQL.
-- ---------------------------------------------------------------------

-- 12.1 Estructura del empleado: el departamento pertenece a la línea de mando y
--      el subdepartamento al departamento.
CREATE TRIGGER dbo.trg_empleados_estructura ON dbo.empleados
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT (UPDATE(linea_mando_id) OR UPDATE(departamento_id) OR UPDATE(subdepartamento_id)) RETURN;

  DECLARE @msg nvarchar(2048);

  SELECT TOP (1) @msg = CONCAT(N'El departamento ', i.departamento_id,
                               N' no pertenece a la línea de mando ', i.linea_mando_id)
    FROM inserted i
   WHERE NOT EXISTS (SELECT 1 FROM dbo.departamentos d
                      WHERE d.id = i.departamento_id AND d.linea_mando_id = i.linea_mando_id);
  IF @msg IS NOT NULL
  BEGIN
    THROW 50000, @msg, 1;
  END

  SELECT TOP (1) @msg = CONCAT(N'El subdepartamento ', i.subdepartamento_id,
                               N' no pertenece al departamento ', i.departamento_id)
    FROM inserted i
   WHERE i.subdepartamento_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM dbo.subdepartamentos s
                      WHERE s.id = i.subdepartamento_id AND s.departamento_id = i.departamento_id);
  IF @msg IS NOT NULL
  BEGIN
    THROW 50000, @msg, 1;
  END
END
GO

-- 12.2 Documento: el tipo de documento debe corresponder al tipo de sujeto.
CREATE TRIGGER dbo.trg_documento_contratista_valido ON dbo.documentos_contratista
AFTER INSERT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  DECLARE @msg nvarchar(2048);

  SELECT TOP (1) @msg = CONCAT(N'El documento ', i.tipo_documento_codigo, N' no aplica a este tipo de sujeto')
    FROM inserted i
    JOIN dbo.tipos_documento td ON td.codigo = i.tipo_documento_codigo
   WHERE (td.aplica_a = N'EMPLEADO'  AND i.empleado_proveedor_id IS NULL)
      OR (td.aplica_a = N'EQUIPO'    AND i.equipo_proveedor_id IS NULL)
      OR (td.aplica_a = N'PROVEEDOR' AND i.proveedor_id IS NULL);
  IF @msg IS NOT NULL
  BEGIN
    THROW 50000, @msg, 1;
  END
END
GO

-- 12.3 Participantes: el personal de proveedor debe estar en semáforo VERDE al agregarlo.
CREATE TRIGGER dbo.trg_participantes_semaforo ON dbo.permiso_participantes
AFTER INSERT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  DECLARE @msg nvarchar(2048);

  SELECT TOP (1) @msg = CONCAT(N'El colaborador de proveedor ', i.empleado_proveedor_id, N' no está en semáforo VERDE')
    FROM inserted i
    LEFT JOIN dbo.v_semaforo_empleado_proveedor s ON s.empleado_proveedor_id = i.empleado_proveedor_id
   WHERE i.empleado_proveedor_id IS NOT NULL
     AND COALESCE(s.semaforo, N'ROJO') <> N'VERDE';
  IF @msg IS NOT NULL
  BEGIN
    THROW 50000, @msg, 1;
  END
END
GO

-- 12.4 Ingresos: el semáforo se toma de la vista, no de lo que mande el cliente.
--      PostgreSQL lo fijaba en un BEFORE INSERT; aquí es un AFTER INSERT que actualiza la propia fila.
--      * Un INSTEAD OF INSERT haría que SCOPE_IDENTITY() devolviera NULL al llamador, por eso se evita.
--      * El UPDATE dispara trg_ingreso_solo_salida; éste se salta cuando está dentro de este trigger
--        (TRIGGER_NESTLEVEL). RECURSIVE_TRIGGERS está OFF por omisión, así que este trigger no se re-dispara.
--      * Si el semáforo real no es VERDE y el ingreso es PERMITIDO, el CHECK de la tabla rechaza el UPDATE
--        (error 547) y se revierte el INSERT. El repo ya manda el semáforo real; un valor desactualizado
--        por carrera falla igual que en PostgreSQL.
CREATE TRIGGER dbo.trg_ingreso_semaforo ON dbo.registros_ingreso
AFTER INSERT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  UPDATE ri
     SET semaforo_al_ingresar = COALESCE(s.semaforo, N'ROJO')
    FROM dbo.registros_ingreso ri
    JOIN inserted i ON i.id = ri.id
    LEFT JOIN dbo.v_semaforo_empleado_proveedor s ON s.empleado_proveedor_id = ri.empleado_proveedor_id
   WHERE ri.semaforo_al_ingresar <> COALESCE(s.semaforo, N'ROJO');
END
GO

-- 12.5 Ingresos: única modificación permitida = registrar la salida, una sola vez.
CREATE TRIGGER dbo.trg_ingreso_solo_salida ON dbo.registros_ingreso
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;
  -- UPDATE interno de trg_ingreso_semaforo: se permite.
  IF TRIGGER_NESTLEVEL(OBJECT_ID(N'dbo.trg_ingreso_semaforo')) > 0 RETURN;

  IF EXISTS (
    SELECT 1
      FROM inserted i
      JOIN deleted d ON d.id = i.id
     WHERE d.salida_en IS NOT NULL
        OR i.salida_en IS NULL
        OR NOT EXISTS (
             SELECT i.empleado_proveedor_id, i.ingreso_en, i.resultado, i.semaforo_al_ingresar, i.epp_completo,
                    i.observaciones, i.motivo_denegacion, i.permiso_id, i.registrado_por
             INTERSECT
             SELECT d.empleado_proveedor_id, d.ingreso_en, d.resultado, d.semaforo_al_ingresar, d.epp_completo,
                    d.observaciones, d.motivo_denegacion, d.permiso_id, d.registrado_por)
  )
  BEGIN
    THROW 50000, N'registros_ingreso es histórico: solo se permite registrar la salida una vez', 1;
  END
END
GO

-- 12.6 Versiones de documento: única modificación permitida = purgar el archivo
--      (ruta_almacenamiento, archivo_eliminado_en, archivo_eliminado_por), una sola vez.
CREATE TRIGGER dbo.trg_versiones_inmutables ON dbo.versiones_documento
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;

  IF NOT EXISTS (SELECT 1 FROM inserted)
     OR EXISTS (
       SELECT 1
         FROM inserted i
         JOIN deleted d ON d.id = i.id
        WHERE d.archivo_eliminado_en IS NOT NULL
           OR i.archivo_eliminado_en IS NULL
           OR NOT EXISTS (
                SELECT i.documento_id, i.numero_version, i.nombre_archivo, i.tipo_mime, i.tamano_bytes,
                       i.sha256, i.fecha_emision, i.fecha_vencimiento, i.subido_por, i.subido_en
                INTERSECT
                SELECT d.documento_id, d.numero_version, d.nombre_archivo, d.tipo_mime, d.tamano_bytes,
                       d.sha256, d.fecha_emision, d.fecha_vencimiento, d.subido_por, d.subido_en)
     )
  BEGIN
    THROW 50000, N'versiones_documento es de solo anexar: solo se permite purgar el archivo', 1;
  END
END
GO

-- 12.7 Inmutabilidad (solo anexar): lo que se firma, se versiona o se audita no se modifica ni se borra.
--      Mensaje: '<tabla> es de solo anexar: no se permite UPDATE|DELETE'
CREATE TRIGGER dbo.trg_auditoria_inmutable ON dbo.eventos_auditoria
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  DECLARE @msg nvarchar(2048) = CONCAT(N'eventos_auditoria es de solo anexar: no se permite ',
                                       CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN N'UPDATE' ELSE N'DELETE' END);
  THROW 50000, @msg, 1;
END
GO

CREATE TRIGGER dbo.trg_registro_servidor_inmutable ON dbo.registro_servidor
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  DECLARE @msg nvarchar(2048) = CONCAT(N'registro_servidor es de solo anexar: no se permite ',
                                       CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN N'UPDATE' ELSE N'DELETE' END);
  THROW 50000, @msg, 1;
END
GO

CREATE TRIGGER dbo.trg_firmas_inmutables ON dbo.firmas_permiso
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  DECLARE @msg nvarchar(2048) = CONCAT(N'firmas_permiso es de solo anexar: no se permite ',
                                       CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN N'UPDATE' ELSE N'DELETE' END);
  THROW 50000, @msg, 1;
END
GO

CREATE TRIGGER dbo.trg_revisiones_inmutables ON dbo.revisiones_documento
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  DECLARE @msg nvarchar(2048) = CONCAT(N'revisiones_documento es de solo anexar: no se permite ',
                                       CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN N'UPDATE' ELSE N'DELETE' END);
  THROW 50000, @msg, 1;
END
GO

CREATE TRIGGER dbo.trg_revocaciones_inmutables ON dbo.revocaciones_revision
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  DECLARE @msg nvarchar(2048) = CONCAT(N'revocaciones_revision es de solo anexar: no se permite ',
                                       CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN N'UPDATE' ELSE N'DELETE' END);
  THROW 50000, @msg, 1;
END
GO

CREATE TRIGGER dbo.trg_documentos_inmutables ON dbo.documentos_contratista
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  DECLARE @msg nvarchar(2048) = CONCAT(N'documentos_contratista es de solo anexar: no se permite ',
                                       CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN N'UPDATE' ELSE N'DELETE' END);
  THROW 50000, @msg, 1;
END
GO

-- 12.8 Entidades que se dan de baja / revocan, pero nunca se borran.
--      Mensaje: '<tabla> no admite borrado: dar de baja o revocar en su lugar'
--      Nota: las FK se evalúan antes que un trigger AFTER; borrar una fila referenciada falla con el
--      error de FK (547) en vez de este mensaje. En ambos casos el borrado no ocurre.
CREATE TRIGGER dbo.trg_permisos_sin_borrado ON dbo.permisos_trabajo
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'permisos_trabajo no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_participantes_sin_borrado ON dbo.permiso_participantes
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'permiso_participantes no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_ingreso_sin_borrado ON dbo.registros_ingreso
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'registros_ingreso no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_empleados_sin_borrado ON dbo.empleados
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'empleados no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_empleado_roles_sin_borrado ON dbo.empleado_roles
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'empleado_roles no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_cargos_area_sin_borrado ON dbo.cargos_area
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'cargos_area no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_roles_sin_borrado ON dbo.roles
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'roles no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_proveedores_sin_borrado ON dbo.proveedores
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'proveedores no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_emp_proveedor_sin_borrado ON dbo.empleados_proveedor
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'empleados_proveedor no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_equipos_proveedor_sin_borrado ON dbo.equipos_proveedor
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'equipos_proveedor no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_usuarios_proveedor_sin_borrado ON dbo.usuarios_proveedor
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'usuarios_proveedor no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

CREATE TRIGGER dbo.trg_credenciales_sin_borrado ON dbo.credenciales_firma
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  THROW 50000, N'credenciales_firma no admite borrado: dar de baja o revocar en su lugar', 1;
END
GO

-- ---------------------------------------------------------------------
-- 13. DATOS BASE (catálogos). La carga del Excel va en seed_organizacion.json.
-- ---------------------------------------------------------------------

INSERT INTO dbo.estados_capacitacion (id, nombre, cuenta_como_aprobada) VALUES
  (0, N'Reprobado', 0),
  (1, N'Aprobada', 1),
  (2, N'Inscrito (no asistió)', 0),
  (3, N'Faltante', 0);

INSERT INTO dbo.permisos (codigo, descripcion) VALUES
  (N'firmar:encargado_area',     N'Firmar permisos como responsable operativo / encargado del área'),
  (N'firmar:responsable_tarea',  N'Firmar permisos como responsable de la ejecución de la tarea'),
  (N'firmar:supervisor_hsea',    N'Firmar permisos como HSEA'),
  (N'firmar:servicio_medico',    N'Firmar permisos como servicio médico y/o brigadista'),
  (N'permisos:crear',            N'Crear y enviar permisos de trabajo'),
  (N'permisos:ver_area',         N'Ver permisos de su área'),
  (N'permisos:ver_todos',        N'Ver permisos de toda la organización'),
  (N'permisos:cerrar',           N'Cerrar permisos de trabajo'),
  (N'contratistas:gestionar',    N'Gestionar proveedores y su personal'),
  (N'contratistas:revisar_documentos', N'Aprobar o rechazar documentos de contratistas'),
  (N'contratistas:validar_medico',     N'Validar exámenes y certificados médicos de contratistas'),
  (N'contratistas:registrar_ingresos', N'Registrar ingresos y salidas de contratistas a planta (verificación de EPP)'),
  (N'organizacion:ver',          N'Consultar empleados y estructura'),
  (N'organizacion:administrar',  N'Administrar departamentos, empleados y cargos de área'),
  (N'roles:administrar',         N'Asignar y revocar roles y permisos'),
  (N'auditoria:ver',             N'Consultar eventos de auditoría');

INSERT INTO dbo.roles (codigo, nombre, descripcion, es_sistema) VALUES
  (N'ADMIN_HSEA',        N'Administrador HSEA',      N'Administra organización, roles y revisa auditoría', 1),
  (N'SUPERVISOR_HSEA',   N'Supervisor HSEA',         N'Firma permisos como HSEA y revisa documentos de contratistas', 1),
  (N'ENCARGADO_AREA',    N'Encargado del área',      N'Firma permisos como responsable operativo del área donde se realiza el trabajo', 1),
  (N'RESPONSABLE_TAREA', N'Responsable de la tarea', N'Firma como responsable de ejecutar la tarea', 1),
  (N'SERVICIO_MEDICO',   N'Servicio médico',         N'Firma permisos como servicio médico y valida exámenes médicos de contratistas', 1),
  (N'GERENTE_AREA',      N'Gerente de área',         N'Ve y da seguimiento a permisos de su línea de mando', 1),
  (N'CONSULTA',          N'Consulta',                N'Solo lectura', 1);

INSERT INTO dbo.rol_permisos (rol_id, permiso_codigo)
SELECT r.id, x.permiso FROM dbo.roles r JOIN (VALUES
  (N'ADMIN_HSEA',N'organizacion:ver'), (N'ADMIN_HSEA',N'organizacion:administrar'),
  (N'ADMIN_HSEA',N'roles:administrar'), (N'ADMIN_HSEA',N'auditoria:ver'),
  (N'ADMIN_HSEA',N'permisos:ver_todos'), (N'ADMIN_HSEA',N'contratistas:gestionar'),
  (N'ADMIN_HSEA',N'contratistas:revisar_documentos'), (N'ADMIN_HSEA',N'contratistas:registrar_ingresos'),
  (N'ADMIN_HSEA',N'firmar:supervisor_hsea'), (N'ADMIN_HSEA',N'contratistas:validar_medico'),
  (N'SUPERVISOR_HSEA',N'contratistas:registrar_ingresos'),
  (N'SUPERVISOR_HSEA',N'firmar:supervisor_hsea'), (N'SUPERVISOR_HSEA',N'permisos:ver_todos'),
  (N'SUPERVISOR_HSEA',N'permisos:cerrar'), (N'SUPERVISOR_HSEA',N'contratistas:revisar_documentos'),
  (N'SUPERVISOR_HSEA',N'organizacion:ver'),
  (N'ENCARGADO_AREA',N'firmar:encargado_area'), (N'ENCARGADO_AREA',N'permisos:ver_area'),
  (N'ENCARGADO_AREA',N'permisos:crear'), (N'ENCARGADO_AREA',N'organizacion:ver'),
  (N'RESPONSABLE_TAREA',N'firmar:responsable_tarea'), (N'RESPONSABLE_TAREA',N'permisos:crear'),
  (N'RESPONSABLE_TAREA',N'permisos:ver_area'),
  (N'SERVICIO_MEDICO',N'firmar:servicio_medico'), (N'SERVICIO_MEDICO',N'contratistas:validar_medico'),
  (N'SERVICIO_MEDICO',N'permisos:ver_area'), (N'SERVICIO_MEDICO',N'organizacion:ver'),
  (N'GERENTE_AREA',N'permisos:ver_area'), (N'GERENTE_AREA',N'organizacion:ver'),
  (N'CONSULTA',N'permisos:ver_area'), (N'CONSULTA',N'organizacion:ver')
) AS x(rol, permiso) ON x.rol = r.codigo;

-- Roles de firma de los formatos (claves de src/config/*). Los que no exigen
-- permiso (solicitante, vigía, contratista, observador...) requieren solo
-- sesión, y quedan auditados.
INSERT INTO dbo.roles_firma (codigo, nombre, permiso_requerido) VALUES
  (N'executor',            N'Responsable de la ejecución',              N'firmar:responsable_tarea'),
  (N'tfs_executor',        N'Responsable de la ejecución por parte de TFS', N'firmar:responsable_tarea'),
  (N'operational_manager', N'Responsable operativo del área',           N'firmar:encargado_area'),
  (N'hsea',                N'HSEA',                                     N'firmar:supervisor_hsea'),
  (N'medical_service',     N'Servicio médico y/o brigadista',           N'firmar:servicio_medico'),
  (N'requester',           N'Solicitante',                              NULL),
  (N'lookout',             N'Prevencionista / vigía',                   NULL),
  (N'contractor',          N'Contratista',                              NULL),
  (N'observer',            N'Observador',                               NULL),
  (N'observed',            N'Observado',                                NULL),
  (N'supervisor',          N'Supervisor',                               NULL);

INSERT INTO dbo.tipos_contratista (codigo, nombre) VALUES
  (N'MANTENIMIENTO',  N'Mantenimiento'),
  (N'REDES',          N'Redes'),
  (N'OBRA_CIVIL',     N'Obra civil'),
  (N'INFRAESTRUCTURA',N'Infraestructura'),
  (N'OTRO',           N'Otro');

INSERT INTO dbo.tipos_trabajo (codigo, nombre, permit_type_slug) VALUES
  (N'CALIENTES',  N'Trabajos calientes',  N'trabajos-calientes'),
  (N'ALTURAS',    N'Trabajos en alturas', N'trabajos-en-alturas'),
  (N'CONFINADOS', N'Espacios confinados', N'espacios-confinados');

INSERT INTO dbo.tipos_documento
  (codigo, nombre, aplica_a, categoria, obligatorio, vigencia_meses, tipo_trabajo_codigo, permiso_revision) VALUES
  (N'IMSS_ALTA',      N'Alta / datos del IMSS',                  N'EMPLEADO', N'IMSS',          1, NULL, NULL, N'contratistas:revisar_documentos'),
  -- vigencia_meses NULL hasta definir la periodicidad del comprobante de pago IMSS (lo sube el proveedor, no el colaborador)
  (N'IMSS_PAGO_PROVEEDOR', N'Comprobante de pago del IMSS',      N'PROVEEDOR', N'IMSS',         1, NULL, NULL, N'contratistas:revisar_documentos'),
  (N'EXAMEN_MEDICO',  N'Examen y certificado médico (anual)',    N'EMPLEADO', N'MEDICO',        1, 12,   NULL, N'contratistas:validar_medico'),
  (N'INDUCCION',      N'Curso de inducción (vigencia 2 años)',   N'EMPLEADO', N'CAPACITACION',  1, 24,   NULL, N'contratistas:revisar_documentos'),
  (N'DC3_CALIENTES',  N'DC-3 trabajos calientes',                N'EMPLEADO', N'CERTIFICACION', 0, NULL, N'CALIENTES',  N'contratistas:revisar_documentos'),
  (N'DC3_ALTURAS',    N'DC-3 trabajos en alturas',               N'EMPLEADO', N'CERTIFICACION', 0, NULL, N'ALTURAS',    N'contratistas:revisar_documentos'),
  (N'DC3_CONFINADOS', N'DC-3 espacios confinados',               N'EMPLEADO', N'CERTIFICACION', 0, NULL, N'CONFINADOS', N'contratistas:revisar_documentos'),
  -- Equipos motorizados: cinco documentos obligatorios por equipo.
  (N'CERT_CALIDAD',       N'Certificado de calidad',     N'EQUIPO', N'CERTIFICACION', 1, NULL, NULL, N'contratistas:revisar_documentos'),
  (N'PROG_MANTENIMIENTO', N'Programa de mantenimiento',  N'EQUIPO', N'CERTIFICACION', 1, NULL, NULL, N'contratistas:revisar_documentos'),
  (N'POLIZA_SEGURO',      N'Póliza de seguro',           N'EQUIPO', N'CERTIFICACION', 1, 12,   NULL, N'contratistas:revisar_documentos'),
  (N'VERIF_VEHICULAR',    N'Verificación vehicular',     N'EQUIPO', N'CERTIFICACION', 1, 6,    NULL, N'contratistas:revisar_documentos'),
  (N'TENENCIA_VEHICULAR', N'Tenencia vehicular',         N'EQUIPO', N'CERTIFICACION', 1, 12,   NULL, N'contratistas:revisar_documentos');
GO
