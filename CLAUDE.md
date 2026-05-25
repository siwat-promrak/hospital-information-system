# Hospital Information System — Project Standards

This file holds project-wide rules that ALL code and commits must follow.

## Code style

### 1. Blank lines around control-flow blocks

Every control-flow block MUST have one blank line **before** and one blank line **after** the statement.

This applies to:
- `if` / `else if` / `else`
- `for` / `for...of` / `for...in`
- `while` / `do...while`
- `switch`
- `try` / `catch` / `finally`

```ts
// good — if
const user = await findUser(id);

if (!user) {
  throw new NotFoundException();
}

return user;

// good — for
const results: Item[] = [];

for (const id of ids) {
  results.push(await fetchItem(id));
}

return results;

// good — while
let attempts = 0;

while (attempts < MAX_RETRIES) {
  attempts += 1;
}

return attempts;

// good — switch
const action = req.action;

switch (action) {
  case 'create':
    return create();
  case 'update':
    return update();
  default:
    throw new BadRequestException();
}

// bad — no blank line before or after
const user = await findUser(id);
if (!user) {
  throw new NotFoundException();
}
return user;
```

Exceptions:
- Don't add a leading blank line if the block is the first statement inside its enclosing block (right after `{`).
- Don't add a trailing blank line if the block is the last statement inside its enclosing block (right before `}`).
- Chained keywords (`} else {`, `} else if {`, `} catch {`, `} finally {`) stay attached to the preceding block — no blank line between them.

### 1a. `if` MUST always use a block — no inline / brace-less form

Every `if` (and `else if` / `else`) MUST use curly braces `{ ... }`, even when the body is a single statement. Inline / brace-less `if` is forbidden.

```ts
// good
if (!user) {
  throw new NotFoundException();
}

if (count > 0) {
  return count;
}

// bad — inline / no braces
if (!user) throw new NotFoundException();

if (!user)
  throw new NotFoundException();

if (count > 0) return count;
```

This applies to all `if` forms (guard clauses, early returns, conditional throws, etc.). The same rule extends by analogy to `else`, `else if`, `for`, `while`, `do...while` — always use a braced block.

### 2. Blank line before `return`

Every `return` statement MUST have one blank line **before** it.

```ts
// good
const result = compute(input);

return result;

// bad
const result = compute(input);
return result;
```

Exception: don't add a blank line if `return` is the only statement in the block.

### 2a. Extract types, constants, and enums into dedicated files

Module-scoped TypeScript types/interfaces, enums, and named constants MUST NOT be declared inside a service, controller, guard, component, hook, or page file. Put them in a sibling file alongside the consumer(s).

File-naming convention:
- `*.types.ts` — TypeScript `type` / `interface` declarations.
- `*.const.ts` — primitive / object constants (header names, cookie keys, regex patterns, default values, …).
- `<concept>.ts` — domain catalogs that are richer than a single constant (e.g. `permissions.ts`, `roles.ts`, `appointment-types.ts`). One file per concept.
- `*.decorator.ts` — class-validator decorator factories (e.g. `@IsScheduleWindowValid()`).
- `*.validation.ts` / `<concept>.validation.ts` — service-layer domain helpers (e.g. `assertNoOverlap`).
- `<module>/decorators/` — all class-validator decorator factories AND all NestJS route/parameter decorators owned by the module live in this folder. One file per decorator. Cross-cutting decorators (used by multiple modules) live under `apps/api/src/common/<concept>/decorators/` (e.g. `apps/api/src/common/pagination/decorators/page-size.decorator.ts`).

What this rule applies to:
- Exported AND non-exported interfaces, types, enums.
- Module-level `const` declarations whose value is fixed at module load (header strings, lists of cookie names, default option sets, regex literals, etc.).
- Const maps used as a TypeScript "enum substitute" (`as const` objects).

What MAY stay inline in the consumer file:
- DTOs (`class FooDto { ... }`) — they ARE the controller contract; colocating them with the controller is fine, though a `dto/` subfolder is also allowed.
- Composite Swagger decorators — see rule 6, those belong in `<module>.swagger.ts` regardless.
- Truly function-scoped constants declared inside a method/function body (small loop bounds, single-use literals).

```ts
// bad — interface + constants declared in the consumer
// users.service.ts
export interface AuthenticatedUser { /* ... */ }
const SESSION_COOKIE_NAMES = ['next-auth.session-token', ...];

@Injectable()
export class UsersService { /* ... */ }

// good — extracted to siblings
// users.types.ts
export interface AuthenticatedUser { /* ... */ }

// auth.const.ts
export const SESSION_COOKIE_NAMES = ['next-auth.session-token', ...] as const;

// users.service.ts
import type { AuthenticatedUser } from './users.types';
// no inline declarations
```

This keeps the consumer file focused on behavior, makes types/constants individually grep-friendly, and allows other files to import them without circular dependencies on a class export.

### 2b. No magic string literals — extract every semantic constant

Rule 2a says **where** module-level constants live. Rule 2b says **what** must become a constant in the first place: any string literal whose value carries domain meaning MUST come from a named constant or typed catalog. Inlining the literal at the call site is forbidden — even if the literal currently appears in only one file.

**MUST be extracted (no exceptions):**
- HTTP endpoint paths — frontend route segments (`"/signin"`, `"/admin"`), backend route segments (`"/auth/resolve"`, `"/auth/signout"`), version prefixes (`"/api/v1"`, `"/api/be"`).
- HTTP header names — `"X-Internal-Secret"`, `"Authorization"`, `"X-Forwarded-For"`.
- Cookie names — `"next-auth.session-token"`, `"authjs.session-token"`.
- Provider / external-system identifiers — OAuth provider ids (`"google"`), database role codes, queue names, env-var name strings.
- Discriminator strings used in `===` comparisons — event types, role codes, error codes, permission codes (per rule 6a), status enums when stored as strings.
- Any string compared with `===` to a different literal of the same value at a separate call site. **Rule of thumb: if a rename touches more than one file, it MUST be a constant.**

**MAY stay inline:**
- Translation keys passed to `t(K.X.Y)` — the `K` catalog already centralises them (rule 4).
- User-facing copy whose authoritative source is a message file (consumed only through next-intl `t()`).
- Free-text strings consumed only by humans (log messages, `Error` constructor arguments, accessibility labels also via i18n).
- Test fixtures where the literal IS the test data (e.g. an expected response body).
- One-shot string literals used in exactly one place AND carrying no domain meaning beyond that line (e.g. a sort direction `"asc"` in a private helper).

**Where the constants live:**
- Backend: per-domain catalog under the owning module — e.g. `apps/api/src/auth/auth.const.ts` (`INTERNAL_SECRET_HEADER`, `SESSION_COOKIE_NAMES`), `apps/api/src/auth-log/auth-log.const.ts` (`AUTH_LOG_EVENT`).
- Frontend: per-domain catalog under `apps/web/src/<domain>/` — e.g. `apps/web/src/auth/routes.ts` (`FE_PATH`, `BE_PATH`), `apps/web/src/auth/oauth.ts` (`OAUTH_PROVIDER`).
- Cross-tier constants that MUST agree between FE and BE (e.g. the internal-secret header name, the version prefix) live in BOTH `apps/api/src/auth/auth.const.ts` AND `apps/web/src/auth/auth.const.ts` — drift causes silent auth failures. A future shared `packages/` workspace will dedupe these, but mirroring is the current contract.

```ts
// bad — magic strings duplicated across files
// auth.ts
if (account?.provider !== "google") { /* ... */ }
return `/signin?error=${key}`;

// SignInButton.tsx
await signIn("google", { callbackUrl });

// SignOutButton.tsx
await fetch(`${BACKEND_REWRITE_PREFIX}/auth/signout`, ...);


// good — single source of truth per literal
// auth/oauth.ts
export const OAUTH_PROVIDER = { GOOGLE: "google" } as const;

// auth/routes.ts
export const FE_PATH = { SIGNIN: "/signin", ADMIN: "/admin", ... } as const;
export const BE_PATH = { AUTH_RESOLVE: "/auth/resolve", AUTH_SIGN_OUT: "/auth/signout" } as const;

// auth.ts
if (account?.provider !== OAUTH_PROVIDER.GOOGLE) { /* ... */ }
return `${FE_PATH.SIGNIN}?error=${key}`;

// SignInButton.tsx
await signIn(OAUTH_PROVIDER.GOOGLE, { callbackUrl });

// SignOutButton.tsx
await fetch(`${BACKEND_REWRITE_PREFIX}${BE_PATH.AUTH_SIGN_OUT}`, ...);
```

Rule 6a (the RBAC catalog) is the canonical instance of this rule — permission codes and role codes always come from `PERMISSION` / `ROLE`. Rule 2b extends the same discipline to every other category of domain-carrying string literal.

## Commits & Pull Requests

### 3. Focused commits, describe what changed

- Each commit MUST be focused on related code only — do NOT mix unrelated changes in one commit.
- Commit messages MUST describe **what changed** (concrete, in the imperative), not vague intent.
  - good: `add MUI theme with darkblue primary and white secondary`
  - good: `configure NestJS ConfigModule and global ValidationPipe`
  - bad: `update stuff`
  - bad: `frontend changes`
- If a change touches multiple unrelated areas, split it into multiple commits.

### 3a. Pull Request description format

Every PR description MUST include these two sections, in this order, using `##` Markdown headings:

```markdown
## Summary
<1-3 sentences explaining WHY this PR exists and the user-visible outcome>

## What's changed
- <concrete change 1 — file/area + what was done>
- <concrete change 2>
- ...
```

- **Summary** answers "why does this PR exist and what does it deliver?" — not a list of files.
- **What's changed** is a bulleted list grouped by area (e.g. backend, frontend, tooling) when the PR spans multiple. Mirrors the commit messages but reads top-down.
- Additional sections (e.g. `## Test plan`, `## Screenshots`, `## Migration notes`) are allowed and encouraged when relevant, but Summary + What's changed are REQUIRED.
- A `.github/pull_request_template.md` is checked in to auto-populate this scaffold on every new PR.

## Frontend (apps/web)

### 4. i18n — `next-intl`, type-safe keys, subpath routing

- All user-facing strings MUST be translated via `next-intl`. Do NOT hardcode UI text in components.
- `apps/web/src/messages/en.json` is the **source of truth**. `th.json` mirrors its shape.
- Do NOT pass raw string keys to `t()`. Use the typed `K` constant: `import { K } from "@/i18n/keys.generated";` then `t(K.Home.title)`.
- Do NOT edit `apps/web/src/i18n/keys.generated.ts` by hand — it is auto-generated by `apps/web/scripts/gen-i18n-keys.mjs` from `en.json`. After changing a message catalog, run `pnpm --filter @hospital/web gen:i18n` (the `predev` / `prebuild` hooks already trigger this automatically).
- Locale type is `AppLocale` from `@/i18n/routing`.
- Routing uses **subpath prefix**: `/en/...`, `/th/...` (configured in `apps/web/src/i18n/routing.ts`).

#### 4a. Locale validation: layout only, not pages

- Validate URL locale (`{ locale: string }`) with `hasLocale(routing.locales, locale)` + `notFound()` **only in `apps/web/src/app/[locale]/layout.tsx`** (both the default export AND `generateMetadata`).
- Pages under `[locale]/` MUST NOT repeat the `hasLocale` guard — the layout already runs first. Pages just call `setRequestLocale(locale)` and proceed.

#### 4b. SEO metadata — hreflang, canonical, sitemap, robots

- `apps/web/src/app/[locale]/layout.tsx` `generateMetadata` emits `metadataBase` + `alternates.canonical` + `alternates.languages` (with `x-default`). Page-level `generateMetadata` may override `alternates` per route.
- `NEXT_PUBLIC_SITE_URL` is the canonical base URL used for hreflang/canonical/robots/sitemap. Default in code with `?? "http://localhost:3000"`. Document it in `apps/web/.env.example`.
- `apps/web/src/app/robots.ts` and `apps/web/src/app/sitemap.ts` are the source of truth — sitemap lists every locale variant with `alternates.languages`. Keep them in sync as routes are added.

#### 4c. 404 pages — locale-scoped only + catch-all trigger

- `apps/web/src/app/[locale]/not-found.tsx` is the **only** 404 — inside the i18n + theme providers, uses `K.NotFound.*` for copy.
- `apps/web/src/app/[locale]/[...rest]/page.tsx` is a tiny catch-all that just calls `notFound()`. **It is required**: without it, unmatched paths under `[locale]` (e.g. `/en/some-typo`) render Next.js's default unstyled 404 instead of our `[locale]/not-found.tsx`, because nested `not-found.tsx` files only fire when `notFound()` is explicitly thrown.
- Do NOT add `apps/web/src/app/not-found.tsx`. With `[locale]/layout.tsx` rendering `<html>` / `<body>`, a root `not-found.tsx` would require a sibling `app/layout.tsx`, and you can't have two layouts rendering the HTML shell. Paths the middleware excludes (`/api/...`, static files) never reach the App Router, so the root fallback isn't doing real work anyway.

#### 4d. Locale switcher must preserve query + hash

- Any locale-switcher component MUST preserve the current query string and hash on switch.
- Query: read via `useSearchParams()` from `next/navigation`, append `?${searchParams.toString()}` to the pathname passed to `router.replace`.
- Hash: read at click time via `window.location.hash` (guard with `typeof window !== "undefined"`) — the hash never reaches the server and `usePathname` from next-intl strips it.

### 5. Theme — split per concern, prefer CSS variables

- The theme is split under `apps/web/src/theme/`:
  - `palette.ts` — color tokens
  - `typography.ts` — font stack
  - `components/<MuiX>.ts` — one file per MUI component override, aggregated via `components/index.ts`
  - `theme.ts` — composes everything with `createTheme`
- Adding a new MUI component override: create `components/Mui<Name>.ts` exporting a typed `mui<Name>` const, then register it in `components/index.ts`.
- For CSS-side color references (plain CSS, SCSS, `sx` string values), **prefer `var(--mui-palette-primary-main)`** etc. over hardcoded hex values. MUI v6 emits these at runtime because `cssVariables: true` is enabled on the theme. This keeps `palette.ts` as the single source of truth.

### 5a. Frontend app layout — one role per top-level folder

The four FE top-level concerns are physically separated. The rule is enforceable with `find`:

| Folder under `apps/web/src/` | Holds | Anti-rule |
| --- | --- | --- |
| `components/` | **Only `.tsx` files.** No types, no constants, no helpers. | `find apps/web/src/components -type f ! -name '*.tsx'` MUST be empty. |
| `types/` | Cross-cutting domain shapes (BE response mirrors). One `<entity>.types.ts` per entity, mirroring the BE module split. | No `.const.ts` files here. |
| `lib/api/` | Transport layer. `server-fetch.ts` (`internalFetch` + `userFetch`), `errors.ts` (`ApiError` + `readErrorEnvelope`), `pagination.ts` (shared `buildPaginationQuery`), per-entity `<entity>.api.ts` + `<entity>.const.ts` for URL contract. | No `.tsx` files. |
| `lib/utils/` | Generic helpers with NO domain knowledge (`parse.ts`, `initials.ts`). If it imports from `auth/` or `types/<entity>`, it doesn't belong here. | — |

`components/` is further organised:
- `components/shared/` — cross-feature UI consumed by multiple pages (e.g. `RoleDashboard.tsx`, `SignInButton.tsx`, `PaginationControl.tsx`).
- `components/<entity>/` — entity-scoped UI (e.g. `components/doctor/DoctorListRow.tsx`, `components/department/DepartmentCardLink.tsx`). Match the BE module name (singular) so the BE/FE split is mirrored.
- `components/app-shell/` — protected-layout chrome (sidebar, header, breadcrumb, user menu).

Feature config folders sibling to `auth/` hold the non-UI side of a tightly-coupled module:
- `auth/` — auth catalogs + config (`auth.const.ts`, `permissions.ts`, `roles.ts`, `routes.ts`, `oauth.ts`, `sign-in-errors.ts`).
- `app-shell/` — shell catalogs + helpers (`layout.const.ts`, `nav-items.ts` + `.const.ts` + `.types.ts`, `breadcrumb-labels.ts`).

The `(app)` route group at `apps/web/src/app/[locale]/(app)/` wraps every authenticated page through `(app)/layout.tsx` which mounts `<AppShell>`. The role dispatcher (`[locale]/page.tsx`) and `/signin` stay OUTSIDE that group so they don't render the chrome.

A page that needs interactive UI (clickable cards, chip links, filter selects) MUST extract it to a `"use client"` component under `components/<entity>/` rather than using `component={Link}` on a server-rendered MUI component — React 19 RSC rejects passing a React component as a prop across the server → client boundary.

### 5b. Server-side API fetch — `internalFetch` vs `userFetch`

The two helpers in `apps/web/src/lib/api/server-fetch.ts` are the ONLY way to call the Nest API from server components and the NextAuth `signIn` callback. Pick by the route's authorization model:

- `internalFetch(path, init?)` — server-to-server, attaches the shared `X-Internal-Secret` header, does NOT forward any cookie. Use for routes decorated with `@InternalRoute()` (currently only `POST /auth/resolve`).
- `userFetch(path, init?)` — server-to-server on behalf of the signed-in user, forwards the incoming request's `cookie` + `authorization` headers via `next/headers`. Use for every cookie-authenticated endpoint.

Both throw the typed `ApiError` (with `status`, `code`, `details`, `body`) from `lib/api/errors.ts` on any non-2xx, so callers can write flat promise chains and narrow with `isApiError(err)` / `hasCode(err, code)`. Do NOT call `fetch` directly from a feature module — the cookie-forwarding + envelope-parsing must stay in one place.

## Backend (apps/api)

### 6. Swagger decorator organization

- Composite Swagger decorators for a controller (the `@ApiOperation` / `@ApiOkResponse` / `@ApiBadRequestResponse` / etc. cluster on a single endpoint) MUST be aggregated into a named decorator built with `applyDecorators` from `@nestjs/common`, so the controller method reads as just `@Get() @ApiCreateThing() create(...)`.
- The composite decorator lives in `<module>.swagger.ts` colocated with `<module>.controller.ts` (flat layout). Example: `apps/api/src/health/health.swagger.ts` exports `ApiHealthCheck()`.
- Keep response example payloads **inline** in the `*.swagger.ts` file by default — do NOT extract to a separate `*.examples.ts` until a second consumer (e.g. an e2e test fixture) appears. Indirection without reuse is overhead.
- Promote to a `<module>/swagger/` subfolder (one file per decorator, kebab-case file `<verb-resource>.decorator.ts` + PascalCase export `ApiVerbResource`) **only** when a module grows past ~3-4 endpoint decorators. Default to flat.
- Do NOT create a cross-cutting `apps/api/src/swagger/` directory — Swagger decorators belong to the feature module that owns them.

#### 6b. DTO naming — suffix encodes role on the wire

Every DTO class AND file under `apps/api/src/<module>/dto/` MUST encode its role (request body / query params / response) in BOTH the export name and the filename so the wire boundary is obvious without opening the file.

**Export-name convention:**

| Category | Export suffix | Examples |
| --- | --- | --- |
| Request body | `Create<X>Dto`, `Update<X>Dto` (or `<Verb><X>Dto` for non-CRUD operations) | `CreateScheduleDto`, `UpdateScheduleDto`, `ResolveDto` |
| Query params | `<List\|Search><X>QueryDto` | `ListSchedulesQueryDto`, `ListDoctorsQueryDto` |
| Response (single item) | `<X>ResponseDto` | `DoctorResponseDto`, `DoctorDetailResponseDto`, `DepartmentResponseDto`, `ScheduleResponseDto`, `MeResponseDto`, `ResolveResponseDto`, `PermissionCheckResponseDto` |
| Response (paginated list) | The generic `PaginatedDto(<X>ResponseDto)` factory — no rename needed. | `PaginatedDto(DoctorResponseDto)` |

Inner reference types embedded in a response (e.g. `DoctorDepartmentAffiliationDto`, `ScheduleDoctorRefDto`, `MeDoctorRefDto`) keep their plain `Dto` suffix — they are NOT top-level endpoint responses and live next to the response DTO that uses them.

**File-name convention** — adopt the explicit form so a `grep` of the filename tells you the role:

| Filename | Holds |
| --- | --- |
| `<verb>-<entity>.dto.ts` | A request body DTO. `create-schedule.dto.ts` → `CreateScheduleDto`; `update-schedule.dto.ts` → `UpdateScheduleDto`. |
| `<verb>-<entities>.query.dto.ts` | A query DTO. `list-schedules.query.dto.ts` → `ListSchedulesQueryDto`; `list-doctors.query.dto.ts` → `ListDoctorsQueryDto`. |
| `<entity>.response.dto.ts` | One or more response DTOs for an entity + their inner reference types. `doctor.response.dto.ts` → `DoctorResponseDto` + `DoctorDetailResponseDto` + `DoctorDepartmentAffiliationDto`. |
| `<verb>.dto.ts` | A request body for a non-CRUD operation that needs a dedicated file (typically because the file is split from a matching response). `resolve.dto.ts` → `ResolveDto`. |

Do NOT mix a request body and a response in the same file — split into `<verb>.dto.ts` + `<entity>.response.dto.ts` (or `<verb>.response.dto.ts` if the response is operation-shaped) so each file has one job. The auth module's `resolve.dto.ts` + `resolve.response.dto.ts` pair is the canonical split.

The `AuthenticatedUser` interface in `users.types.ts` is NOT a wire DTO — it is the per-request structural type populated by `JwtGuard`. It stays in `*.types.ts` and is mirrored (structurally) by `MeResponseDto` for OpenAPI; do NOT rename it.

**Why no `Request` suffix on bodies?** Two conventions are defensible. The "consistent suffix" school tags every DTO with its role (`CreateScheduleRequestDto`, `ScheduleResponseDto`, `ListSchedulesQueryDto`) — symmetric and greppable, but redundant: `Create` already MEANS request, and you can't have a `Create...ResponseDto` (the response to a create is named after what comes back, e.g. `ScheduleResponseDto`, not after the action). We pick the "verb prefix carries direction" school: request bodies use a verb prefix and no role suffix (`CreateScheduleDto`, `ResolveDto`); query DTOs and response DTOs keep their role suffix because they have no verb to do that work (`List` alone is too thin; an entity name alone wouldn't tell you "this is what came back"). The asymmetry tells a true story about the data — a request shape is owned by an action, a response shape is owned by an entity — and matches the de-facto NestJS community convention (`CreateUserDto` / `UpdateUserDto`). Non-CRUD bodies (`ResolveDto`, `RefreshTokenDto`) stay verb-y bare names; their matching response gets the suffix (`ResolveResponseDto`), so the pair never collides.

### 6a. RBAC catalog — never hardcode permission or role codes

Permission and role codes have a single source of truth in `apps/api/src/auth/`. Application code (guards, decorators, services, DTOs, tests) AND the Prisma seeders MUST import from it — never inline the string literal.

- `apps/api/src/auth/permissions.ts` exports:
  - `PERMISSION` — typed `as const` map (e.g. `PERMISSION.SCHEDULE_CREATE_OWN === 'schedule.create.own'`). Codes are **CRUD-verb-shaped + scope-aware**: `<resource>.<create|read|update|delete>.<own|own-department|all>`. The verb tells the route which HTTP method gates it; the scope suffix tells the service layer how to narrow queries.
  - `PermissionCode` — union type of the values.
  - `PERMISSION_CATALOG` — ordered list (35 entries: user 4 + role 4 + appointment 9 + schedule 9 + patient 4 + doctor 1 + medical_records 4) with descriptions, consumed by the Prisma seeder. The `permissions` table is catalog-only — no audit columns, no admin runtime CRUD.
- `apps/api/src/auth/roles.ts` exports:
  - `ROLE` — typed `as const` map (e.g. `ROLE.NURSE === 'NURSE'`).
  - `RoleCode` — union type.
  - `ROLE_CATALOG`, `SIGN_IN_ELIGIBLE_ROLES`, and `DEFAULT_ROLE_PERMISSIONS` (the seeded 5-role / 50-policy baseline: ADMIN→9, DOCTOR→15, NURSE→14, MEDICAL_RECORDS_OFFICER→9, PHARMACY→3).
- `apps/api/src/auth/scope.ts` exports per-verb `resolve<Resource><Verb>Scope(user)` helpers (e.g. `resolveScheduleCreateScope`, `resolveAppointmentReadScope`, `resolveMedicalRecordsUpdateScope`) which return the widest scope (`.all` > `.own-department` > `.own`) the caller holds for a given `(resource, verb)` family. Service-layer scope filters MUST go through these helpers, never branch on `roleCode` directly.

`is_deletable` invariant: `roles` AND `policies` carry an `is_deletable` column (default `true`). All seeded baseline rows are pinned to `false` so a future F11 admin UI cannot delete them. The invariant lives in F11's service layer; the schema only persists the column.

```ts
// bad
@RequirePermission('schedule.create.own-department')
async createSchedule() { /* ... */ }

if (user.roleCode === 'DOCTOR') { /* ... */ }

// good
import { PERMISSION } from '../auth/permissions';
import { ROLE } from '../auth/roles';

@RequirePermission(
  PERMISSION.SCHEDULE_CREATE_OWN,
  PERMISSION.SCHEDULE_CREATE_OWN_DEPARTMENT,
)
async createSchedule() { /* ... */ }

if (user.roleCode === ROLE.DOCTOR) { /* ... */ }
```

Adding a new permission is a three-step change in this exact order:
1. Add a new entry to `PERMISSION` AND `PERMISSION_CATALOG` (with description) in `apps/api/src/auth/permissions.ts`.
2. (Optional) Grant it to one or more roles by editing `DEFAULT_ROLE_PERMISSIONS` in `apps/api/src/auth/roles.ts`.
3. Re-run `pnpm --filter @hospital/api db:seed` so the new row + policies land in the DB.

Never re-declare permission/role codes in `prisma/seed/*.ts` — those files already import from the catalog. The same applies to `messages/*.json` namespaces in F12: derive the keys from the catalog, do not hand-list them.

## Package management

### 7. Pin exact versions

- All dependencies in every `package.json` MUST be pinned to **exact** versions — no `^`, no `~`.
- The root `.npmrc` sets `save-exact=true` so `pnpm add <pkg>` writes exact versions automatically. Do NOT remove or override this.
- The root `package.json` pins `packageManager: pnpm@<version>` (Corepack-compatible) and `engines.node: ">=20"`. Do NOT downgrade or remove these without discussion.
- To upgrade a dep, run `pnpm add <pkg>@<exact-version>` (or edit the version in `package.json` then `pnpm install`). Do NOT hand-edit `pnpm-lock.yaml`.

## Cross-tier conventions

### 8. Pagination — every list endpoint uses the shared `Paginated<T>` envelope

Every BE list endpoint that can grow past a handful of rows (`GET /departments`, `GET /doctors`, `GET /patients`, `GET /appointments`, …) MUST be paginated with the same contract. Detail endpoints (`GET /doctors/:id`) are exempt.

**Wire contract** — request: `?page=N&pageSize=M` (1-indexed `page` ≥ 1, `pageSize` either an integer in `[1, MAX_PAGE_SIZE]` (= 500) OR the literal sentinel string `all` — both query params optional). Response:

```ts
interface Paginated<T> {
  data: T[];
  total: number;        // post-filter row count
  page: number;         // echoed request value (or default; forced to 1 when pageSize=all)
  pageSize: number;     // echoed request value, or `total` when pageSize=all
  totalPages: number;   // Math.max(1, Math.ceil(total / pageSize)); 1 when pageSize=all
}
```

`pageSize=all` is the "fetch everything matching the filter" sentinel. It is reserved for views that genuinely need the full filtered set in one round-trip — currently the F06 schedule calendar's `from` / `to` date-window fetch. The sentinel disables paging entirely (`take: undefined` on the Prisma query) and is the ONLY way to bypass `MAX_PAGE_SIZE`. Other endpoints continue to default to `DEFAULT_PAGE_SIZE = 20`.

Defaults / limits: `DEFAULT_PAGE = 1`, `DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 500` (numeric ceiling), `PAGE_SIZE_ALL = 'all'` (unbounded sentinel). Mirrored verbatim between BE and FE so a rename surfaces on both sides.

**Backend** — shared infra at `apps/api/src/common/pagination/`:
- `PaginationQueryDto` — class-validator `page` is `@IsInt @Min(1)` with `@Type(() => Number)`; `pageSize` is a union (`number | PageSizeAll`) validated by the custom `@IsPageSize()` decorator at `page-size.validator.ts` (accepts integers in `[1, MAX_PAGE_SIZE]` or the exact lowercase string `'all'`). Compose via `extends` for endpoints that add filter params (e.g. `class ListDoctorsQueryDto extends PaginationQueryDto { departmentId?: string }`).
- `PaginationParams` (in `pagination.types.ts`) — service-layer mirror of `PaginationQueryDto`. Every `List*Args` interface in a feature module (`ListDoctorsArgs`, `ListSchedulesArgs`, `ListDepartmentsArgs`, …) MUST `extends PaginationParams` instead of re-declaring `page` / `pageSize`. Single source of truth so a rename surfaces in one place.
- `PaginatedDto(ItemDto)` — Swagger factory; returns a typed `Paginated<ItemDto>` class so each endpoint's OpenAPI schema shows the right item shape. Register with `@ApiExtraModels(ItemDto, PaginatedItemDto)`.
- `resolvePagination(query)` + `buildPaginatedResponse(data, total, page, pageSize)` — service helpers. Run `Promise.all([prisma.X.findMany({ skip, take, ... }), prisma.X.count({ where })])` so the row fetch + count happen in one round-trip. When `pageSize === PAGE_SIZE_ALL` the helper returns `take: undefined` (Prisma "no LIMIT") and `buildPaginatedResponse` echoes `pageSize = total`, `page = 1`, `totalPages = 1`.

**Frontend** — shared infra at `apps/web/src/lib/api/`:
- `pagination.ts` — `buildPaginationQuery(params, extraParams?)` produces the `?page=…&pageSize=…&filter=…` suffix. Pass per-endpoint filter params via the `extraParams` slot (skips `undefined` / `""`).
- `pagination.const.ts` — `DEFAULT_PAGE`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`, `PAGINATION_QUERY_PARAM` (FE-side mirror of the BE constants).
- API client returns `Promise<Paginated<T>>`.
- Pages read `page` from `searchParams`, parse with `parsePositiveInt(value) ?? DEFAULT_PAGE`, and render `<PaginationControl>` (`components/shared/PaginationControl.tsx`) which preserves any other query params (e.g. `departmentId`) on navigation and hides itself when `totalPages <= 1`.
- Filter changes (e.g. switching department in `DoctorListFilter`) MUST reset `page=1` so the user doesn't land on an empty page that no longer exists in the new result set.

### 9. Dayjs for ALL date / time arithmetic

Both `apps/api` and `apps/web` MUST use `dayjs` for any date/time math — now-comparison, add/subtract, formatting, parsing, range checks, timezone handling. Hand-rolled `Date` arithmetic is forbidden.

**Banned (refactor on sight):**
- `new Date(d.getTime() + 86_400_000)` and friends — use `dayjs(d).add(1, 'day').toDate()`.
- `Date.UTC(...)`, `d.getUTCDate()`, `d.setUTCHours(...)` — use `dayjs.utc(...)`.
- `Intl.DateTimeFormat(...).format(d)` for user-visible dates — use `dayjs(d).locale(locale).format('LL')` (or appropriate `localizedFormat` token).
- Lexicographic ISO comparison (`a.startAt.localeCompare(b.startAt) < 0`) — use `dayjs(a.startAt).isBefore(b.startAt)`.
- Manual `(end - start) / 60_000` minute math — use `dayjs(end).diff(start, 'minute')`.

**Allowed:**
- `new Date()` to capture "now" at a boundary — then immediately wrap: `const now = dayjs();`.
- Prisma returning `Date` — wrap with `dayjs(prismaRow.startAt)` before any arithmetic.
- ISO datetime strings on the wire — parse with `dayjs(iso)` (no plugin needed for ISO-8601).
- Test fixtures where the literal datetime IS the test data.

**Versions + setup (exact-pin per rule 7):**
- `dayjs@1.11.13` (both apps).
- Plugins enabled at app start (BE: `apps/api/src/dayjs.ts` loaded from `main.ts`; FE: `apps/web/src/lib/dayjs.ts` imported once from the root layout): `utc`, `timezone`, `localizedFormat`, `isSameOrBefore`, `isSameOrAfter`, `customParseFormat`.
- FE additionally imports `dayjs/locale/th` and `dayjs/locale/en` so locale-switching matches next-intl.
- BE math always runs in UTC (`dayjs.utc()`). FE renders in the user's locale via `dayjs(iso).locale(locale)`.

This rule is the source of truth for past-schedule validation on the BE (`schedule.startAt > dayjs.utc()` on create AND on the merged row when editing) and the read-only predicate on the FE.
