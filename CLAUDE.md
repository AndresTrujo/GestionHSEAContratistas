# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

HSEA work-permit and contractor-control app (Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4). UI text, file names and domain comments are in Spanish; identifiers in code are in English.

## Commands

- `npm run dev` — dev server
- `npm run build` / `npm start` — production build / serve
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`)
- `npm run type_check` — `tsc --noEmit`

There is no test framework configured yet.

## Naming conventions (enforced by ESLint)

- Functions and methods: `snake_case` (e.g. `get_session`, `find_permit_type`, repository methods like `list_by_type`).
- Variables: `camelCase`. Classes, interfaces, type aliases: `PascalCase`.
- In `.tsx` files, functions may also be `PascalCase` (React components).
- `any` is forbidden (`@typescript-eslint/no-explicit-any: error`). Free-form payloads use `Record<string, string | number | boolean | null>`.
- Source file names are Spanish snake_case (`tipos_permiso.ts`, `proveedor_datos.ts`); components are PascalCase (`AppHeader.tsx`).
- Import alias: `@/*` → `src/*`.

## Architecture

**Routing** (`src/app`): `/` redirects to `/inicio`. `/login` is public. Everything under the `(app)` route group is authenticated — `src/app/(app)/layout.tsx` calls `get_session()` and redirects to `/login` if absent, then renders `AppHeader`. Dynamic route `params` are `Promise`s and must be awaited (Next 15).

**Auth** (`src/lib/auth`): provisional — login takes only an employee number (no password) and stores it in the httpOnly cookie `hsea_session` (8h) via server actions in `acciones.ts`. The employee number is the actor identity used throughout audit fields.

**Static configuration** (`src/config`):
- `modulos.ts` — modules shown on `/inicio` (work permits, contractors).
- `tipos_permiso.ts` — catalog of permit types, each mapped to a controlled HSEA form (`FO-xxxx` code), validity rules, checklist flag and required `signerRoles`. `/permisos-trabajo/[permitTypeSlug]` resolves against this catalog and 404s on unknown slugs. Add new permit types here, not in a database.

**Domain** (`src/domain`): pure types only.
- `auditoria.ts` — traceability rule: every persisted entity extends `AuditMetadata` (ISO timestamps + employee numbers), and every mutation must append an immutable `AuditEvent` (append-only, never edited).
- `permisos.ts` — `WorkPermit` with status lifecycle `draft → submitted → approved/rejected → closed`; type-specific data lives in `fields`.
- `contratistas.ts` — `Provider` → `ProviderEmployee` (whose `profileSlug` determines required documents) → `EmployeeDocument` with versioned `EmployeeDocumentVersion`s (old versions kept; sha256, storage path) and a review status.

**Data layer** (`src/lib/data`): the backend is not chosen yet. `repositorios.ts` defines the repository interfaces (`DataRepositories`: `audit`, `permits`, `providers`, `documents`); `proveedor_datos.ts` → `get_repositories()` is the single entry point and selects an implementation by the `DATA_PROVIDER` env var (`"memory"` — default, in-memory dummy data in `lib/data/memoria/`, lost on restart — `"firebase"` or `"railway"`/PostgreSQL). Firebase/Railway implementations are meant to go in `lib/data/firebase` and `lib/data/railway`; until then `get_repositories()` throws for them. App code must depend only on the interfaces, never on a specific provider. See `.env.example` for required env vars.

## Styling

Tailwind v4 configured in CSS (`src/app/globals.css` `@theme`), no `tailwind.config`. Use the brand tokens (`brand-navy`, `brand-cyan`, `brand-green`, `neutral-light`, `neutral-dark`, `brand-navy-alt`) rather than arbitrary colors. Headings (`h1`–`h3`) use the display font (Helvetica Neue Condensed Black, loaded from `public/fonts/HelveticaNeue-BlackCond.otf`); body uses Arial.

# Plataforma de gestión digital HSEA

Servicio web en la nube para manejar los permisos de trabajo de colaboradores y proveedores, y llevar el control de contratistas: cada proveedor registra a sus colaboradores con su documentación del IMSS y su DC-3, con perfiles y requisitos documentales distintos según los trabajos que vayan a realizar.

## Reglas del proyecto

### Convenciones de código
- Funciones y métodos en `snake_case`.
- Clases e interfaces en `PascalCase`.
- Variables en `camelCase`.
- Los componentes React se nombran en `PascalCase` (lo exige el framework).
- Evitar `any` en TypeScript.

### Stack
- Next.js y Tailwind CSS.
- Base de datos en un servicio externo (Firebase o Railway), elegido con `DATA_PROVIDER`.

### Datos y trazabilidad
- Todas las decisiones de diseño y manejo de datos deben tomar en cuenta la trazabilidad de los datos y de los documentos a guardar.

### Identidad visual
- Títulos: Helvetica Neue Condensed Black.
- Texto normal: Arial Regular.
- Colores principales: `#19243E`, `#65BDCC`, `#3AAA35`.
- Colores secundarios: `#C4C5C5`, `#737472`, `#1F2D4E`.

## Forma de trabajo
- Las pruebas las realizo yo: no ejecutes comandos de "run" (dev, build, start, test).
- No des un resumen de cada implementación nueva; solo avísame que ya quedó.