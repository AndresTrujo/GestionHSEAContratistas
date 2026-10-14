# Guía de implementación — BD de organización, roles y firmas HSEA

> Para Claude Code. Complementa `CLAUDE.md` (respeta sus convenciones: funciones `snake_case`,
> variables `camelCase`, tipos `PascalCase`, **sin `any`**, archivos en español snake_case, trazabilidad
> en toda decisión de datos). **No ejecutes comandos de run (dev/build/start/test)**; al terminar solo avisa que quedó.

## 0. Archivos que acompañan esta guía

| Archivo | Para qué |
|---|---|
| `esquema.sql` | DDL PostgreSQL (Railway): organización, cargos de área, roles/permisos, capacitaciones, firmas, auditoría, vistas y funciones de autorización. Ya validado cargándolo con los datos de abajo. |
| `seed_organizacion.json` | Datos extraídos de `Capacitacion_Master_v5.xlsx`, ya normalizados. Contiene datos personales: no subirlo a un repo público. |

Colócalos en: `src/lib/data/railway/esquema.sql` y `src/lib/data/memoria/seed_organizacion.json`.

## 1. Alcance de esta fase

Prioridad: **departamentos, empleados, encargados y gerentes** + **roles y permisos** que determinan quién puede firmar como
**encargado del área**, **responsable de la tarea** y **supervisor HSEA**. Capacitaciones se incluyen porque el Excel es la plantilla
y permiten exigir cursos a un rol (opcional). La tabla de permisos de trabajo en sí se diseña después; aquí solo queda `firmas_permiso`.

Fuera de alcance ahora: tablas `DNC*` y hojas `Auditoria_*` del Excel (eran bitácoras del proceso de captura en Excel; la auditoría nueva es `eventos_auditoria`).

## 2. Modelo (resumen)

```
lineas_mando 1─* departamentos 1─* subdepartamentos
      │               │                  │
      └──────── empleados (no_empleado PK, jefe_no_empleado → empleados)
cargos_area   : GERENTE (línea) | ENCARGADO (departamento/subdepartamento), con vigencia
roles ─* rol_permisos *─ permisos          (códigos de permiso = lista cerrada en código)
empleado_roles: empleado + rol + alcance (GLOBAL|LINEA_MANDO|DEPARTAMENTO|SUBDEPARTAMENTO) + vigencia + quién lo otorgó
rol_cursos_requeridos: cursos que exige un rol → cursos / capacitaciones / estados_capacitacion
firmas_permiso: rol_firma + firmante + área + "foto" de la autorización (inmutable)
eventos_auditoria: append-only (trigger bloquea UPDATE/DELETE)
```

### Decisiones tomadas (cámbialas solo si el usuario lo pide)

1. **Cargo ≠ rol.** `cargos_area` dice *quién manda en qué área* (dato organizacional, viene del Excel). `empleado_roles` dice *qué puede hacer en el sistema*.
   Un encargado del Excel **no** obtiene automáticamente permiso de firma: se le asigna el rol `ENCARGADO_AREA` (el seed trae sugerencias para revisar).
2. **Gerente = responsable de línea de mando; Encargado = responsable de departamento o subdepartamento.** Se eliminan las columnas `NoEmpleadoResponsable/Responsable` del Excel (una sola fuente de verdad: `cargos_area`). Permite varios encargados vigentes por área y suplentes (`es_suplente`).
3. **Alcance jerárquico.** Un rol con alcance `LINEA_MANDO` cubre todos sus departamentos/subdepartamentos; `DEPARTAMENTO` cubre sus subdepartamentos; `GLOBAL` cubre todo. Lo resuelve `tiene_permiso(no_empleado, permiso, departamento_id, subdepartamento_id)`.
4. **Permisos = lista cerrada en código** (`src/config/permisos.ts`, sincronizada a la tabla `permisos`); **roles y asignaciones en BD** (cambian sin deploy). Los roles de firma que exige cada tipo de permiso siguen en `src/config/tipos_permiso.ts` (`signerRoles`), usando los códigos `ENCARGADO_AREA | RESPONSABLE_TAREA | SUPERVISOR_HSEA`.
5. **Solo empleados activos** pueden tener roles/cargos efectivos (las vistas `v_roles_vigentes` y `v_cargos_vigentes` filtran `activo`, revocados y vencidos). Los dados de baja se conservan para trazabilidad.
6. **Nunca se borra** (empleados, roles asignados, cargos): se da de baja / se revoca (`revocado_en`, `vigente_hasta`). Las firmas y la auditoría son inmutables.
7. **Firma con "foto".** `firmas_permiso` guarda nombre, puesto, `empleado_rol_id` y `cargo_area_id` vigentes al firmar, y `hash_documento`, para que cambios futuros de organigrama no alteren lo firmado.
8. **Identidad = `no_empleado`** (entero), igual que el login provisional por cookie `hsea_session`.

### Normalizaciones aplicadas al Excel (ya reflejadas en el seed)

- Los 23 renglones "Sin subdepartamento" (uno por departamento) → `subdepartamento_id = NULL`; el seed trae solo los 15 subdepartamentos reales.
- Se descartan columnas redundantes de `Empleados` (`NombreCompleto`, `Departamento`, `SubDepartamento`, `LineaDeMando`, `JefeDirecto` en texto); se conservan los IDs y el número del jefe.
- 47 cargos de área generados desde las columnas de responsable (9 gerentes de línea, 23 encargados de departamento, 15 de subdepartamento). Ojo: líneas 8 y 9 (Dirección TFS / Dirección General TFS) comparten responsable (201453).
- `fecha_baja` se usa como `vigente_hasta` del cargo cuando el titular ya está dado de baja.

### Hallazgos de calidad de datos (avisar al usuario, no "arreglar" en silencio)

- **5 cargos tienen titular dado de baja** (sin responsable activo): empleados 205092 (gerente de la línea *Gerencia Aero* y encargado de *Dirección TFS Aero*), 204026 (*Project Development*), 202245 (*Reparaciones* y *Recubrimientos*). Estas áreas no tendrán quién firme como encargado hasta que se asigne uno nuevo.
- **14 empleados inactivos sin `fecha_baja`** (principalmente puesto RESIDENTE). El esquema solo exige "con baja ⇒ inactivo".
- 24 empleados sin `genero` (columna opcional). 1 empleado sin jefe directo (el Director, 201453).
- Hoja `Estados` y `Cursos` están completas; `Capacitaciones` no trae caducidad: `cursos.vigencia_meses` queda `NULL` (sin caducidad) hasta que HSEA defina vigencias.

## 3. Roles iniciales (ya en `esquema.sql`)

| Rol | Permisos principales | Alcance típico |
|---|---|---|
| `ADMIN_HSEA` | organizacion:administrar, roles:administrar, auditoria:ver, permisos:ver_todos, contratistas:* | GLOBAL |
| `SUPERVISOR_HSEA` | **firmar:supervisor_hsea**, permisos:cerrar, permisos:ver_todos, contratistas:revisar_documentos | GLOBAL |
| `ENCARGADO_AREA` | **firmar:encargado_area**, permisos:crear, permisos:ver_area | DEPARTAMENTO / SUBDEPARTAMENTO |
| `RESPONSABLE_TAREA` | **firmar:responsable_tarea**, permisos:crear, permisos:ver_area | GLOBAL o por área |
| `GERENTE_AREA` | permisos:ver_area, organizacion:ver | LINEA_MANDO |
| `CONSULTA` | solo lectura | según asignación |

### Sugerencias de asignación (`sugerencias_empleado_roles` en el seed — **no** se cargan solas)

52 propuestas para que el usuario revise y confirme: 1 `ADMIN_HSEA` (204692, Gerente HSE, para poder arrancar), 9 `SUPERVISOR_HSEA` (por puesto: Supervisor HSE/HSEA, Gerente HSE, Resp. SSPA, Sup. Seguridad Industrial), 8 `GERENTE_AREA`, 34 `ENCARGADO_AREA` (titulares activos de cargos de área).
No hay sugerencia para `RESPONSABLE_TAREA`: decidir con el usuario si es cualquier empleado/proveedor autorizado o una lista controlada.

## 4. Regla de autorización para firmar (implementar tal cual)

`puede_firmar(actor, rol_firma, area_del_permiso)` es verdadero solo si **todo** se cumple:

1. El actor existe y está **activo**.
2. Tiene un `empleado_roles` vigente (no revocado, dentro de fechas) cuyo rol incluye el permiso `firmar:<rol_firma>` y cuyo alcance **cubre** el área del permiso (`tiene_permiso(...)`).
3. Si el rol tiene `rol_cursos_requeridos`, `cumple_cursos_rol(actor, rol_id)` es verdadero.
4. **Segregación de funciones:** una misma persona no firma dos roles distintos del mismo permiso (decidirlo con el usuario; por omisión, bloquear).
5. El rol de firma está en `signerRoles` del tipo de permiso.

Al firmar: insertar en `firmas_permiso` (con la foto) y en `eventos_auditoria` dentro de la misma transacción.
Cuando el área del permiso no tenga departamento, usar el de la solicitud; `subdepartamento_id` puede ser `NULL`.

## 5. Plan de trabajo sugerido (en este orden)

1. **Dominio** (`src/domain/organizacion.ts`, `src/domain/acceso.ts`): tipos `LineaMando`, `Departamento`, `Subdepartamento`, `Empleado`, `CargoArea`, `Rol`, `AsignacionRol`, `AlcanceRol`, `RolFirma`, `FirmaPermiso`, extendiendo `AuditMetadata` de `src/domain/auditoria.ts`. Sin `any`.
2. **Config** (`src/config/permisos.ts`): constante con los códigos de permiso (misma lista que la tabla `permisos`) y tipo `CodigoPermiso` derivado; actualizar `signerRoles` de `tipos_permiso.ts` para usar los códigos de rol.
3. **Repositorios** (`src/lib/data/repositorios.ts`): agregar `organization`, `employees`, `access`, `signatures` a `DataRepositories`. Métodos mínimos (snake_case):
   - `employees`: `find_by_number`, `list_by_department`, `search`.
   - `organization`: `list_lines`, `list_departments`, `list_subdepartments`, `list_area_roles` (cargos), `assign_area_role`, `end_area_role`.
   - `access`: `list_roles`, `list_assignments_by_employee`, `assign_role`, `revoke_role`, `has_permission(actor, permiso, area)`, `can_sign(actor, rolFirma, area)`, `list_eligible_signers(rolFirma, area)`.
   - `signatures`: `sign_permit`, `list_by_permit`.
   Toda mutación recibe el actor y llama `audit.append(...)`.
4. **Implementación en memoria** (`lib/data/memoria/`): cargar `seed_organizacion.json`; replicar las reglas de la sección 4 en TypeScript (la lógica de alcance de `tiene_permiso` ≡ GLOBAL / coincide con línea / departamento / subdepartamento).
5. **Implementación Railway** (`lib/data/railway/`): usar `esquema.sql`; las consultas de autorización pueden apoyarse en `v_permisos_empleado`, `tiene_permiso()` y `cumple_cursos_rol()`. Script `scripts/cargar_seed.ts` que inserte el JSON en orden: líneas → departamentos → subdepartamentos → empleados (primero sin jefe, luego actualizar `jefe_no_empleado`) → cargos_area → reglas_departamentos_rh → cursos → capacitaciones. Las `sugerencias_empleado_roles` se cargan solo con confirmación explícita (otorgadas por 204692 / el administrador).
6. **Auth** (`src/lib/auth`): al iniciar sesión validar que el `no_empleado` exista y esté activo; exponer en `get_session()` sus roles vigentes. Mantener el login provisional sin contraseña salvo que el usuario pida cambiarlo.
7. **UI** (usar tokens de marca): pantallas de administración bajo `(app)/administracion/`: organización (líneas/departamentos y sus gerentes/encargados), empleados (búsqueda y ficha con jefe, cargos y roles), roles y asignaciones (con alcance y vigencia, motivo obligatorio), y vista "firmantes elegibles por área". Protegerlas con `roles:administrar` / `organizacion:administrar`.
8. **Firebase** (si se elige `DATA_PROVIDER=firebase`): colecciones con los mismos nombres; `empleado_roles` y `cargos_area` como colecciones raíz con `noEmpleado` indexado; la lógica de alcance vive en el repositorio (no hay vistas). Dejar `get_repositories()` lanzando error hasta implementarlo.

## 6. Pendientes para decidir con el usuario

- ¿Quién puede ser **responsable de la tarea**? (cualquier empleado activo con ciertos cursos / lista controlada / también personal de proveedores).
- ¿Qué **cursos exige** cada rol de firma (p. ej. `CUR033 Supervisor de Seguridad y Ambiental` para `SUPERVISOR_HSEA`; `CUR016`, `CUR019`, `CUR030`, `CUR011` según el tipo de trabajo) y con qué **vigencia** (`vigencia_meses`)?
- ¿Se permite **suplente** de encargado y hasta cuándo?
- ¿Segregación de funciones estricta (misma persona no firma dos roles)?
- ¿Quién será el **primer ADMIN_HSEA**? (sugerido: 204692)
- Reasignar los **5 cargos sin titular activo** (sección 2).
