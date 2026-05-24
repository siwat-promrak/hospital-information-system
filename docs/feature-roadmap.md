# Hospital Information System — Feature Roadmap

Branch-per-feature delivery plan for the Appointment Booking module. Each
feature lands as one focused PR into `development`. User stories referenced
below live in `docs/user-stories.md`.

> **These planning docs ship as their own PR first.** Before F01, the
> `docs/user-stories.md` + `docs/feature-roadmap.md` files land via a
> `chore/docs-roadmap` branch → PR into `development`. That keeps F01
> purely focused on schema. Subsequent features follow the table below.

---

## 1. Conventions

### Branching

- Branch from latest `development`:
  `git fetch origin && git switch -c feat/<area>-<short-desc> origin/development`
- Naming:
  - `feat/<area>-<short-desc>` — new functionality (e.g.
    `feat/db-foundation`, `feat/auth-backend`).
  - `fix/<area>-<short-desc>` — bug fixes.
  - `chore/<area>-<short-desc>` — tooling, deps, refactors with no user
    impact.
- One feature per branch. Do not stack multiple feature IDs on one branch.

### PRs

- Open the PR against `development`.
- The `.github/pull_request_template.md` enforces two required sections:
  `## Summary` and `## What's changed`. Both must be filled.
- Each PR must keep the following green:
  - `pnpm install` (lockfile up to date)
  - `pnpm type-check`
  - `pnpm build`
  - `pnpm test` (when tests exist for the touched area)
- Commits inside the PR follow `CLAUDE.md` §3: focused, what-changed
  messages in the imperative (e.g. `add Prisma schema for User and
  Patient`, not `update stuff`). Split unrelated changes into separate
  commits.
- Self-review before requesting review: read your own diff, verify no
  stray files, verify the smoke-test steps in the feature breakdown still
  pass.

### Roles model

- Roles are now DB rows in the `roles` table; the `Role` Prisma enum has
  been removed.
- Three roles are seeded: **ADMIN**, **STAFF**, **DOCTOR**. (Patient
  sign-in is out of scope — patients are pure records managed by STAFF /
  ADMIN. See the top callout in `user-stories.md`.)
- Permission checks go through the `policies` table (role↔permission
  join). Permissions are **code-defined** (canonical list of **16** in
  `apps/api/prisma/seed/permissions.ts`); the role→permission assignments
  are **runtime-mutable** by an ADMIN holding `permission.assign`.
- **Seeded baseline (17 policies total):**
  - **ADMIN → 5 permissions** (narrowed to user/role/policy management
    only): `user.invite`, `user.disable`, `user.list`, `role.manage`,
    `permission.assign`. Clinic operations are NOT in the default ADMIN
    grant; ADMIN may grant them to themselves via `permission.assign`.
  - **STAFF → 11 permissions** (operational baseline): `appointment.*`
    (4), `schedule.manage` (1), `patient.create`/`read`/`update`/`list`
    (4), `doctor.read`/`doctor.list` (2).
  - **DOCTOR → 1 permission**: `schedule.manage`. The schedule CRUD
    service MUST enforce app-layer own-doctor scope when
    `caller.role === DOCTOR` (restrict to `schedule.doctorId ===
    caller.doctor.id`). STAFF gets the unrestricted form.

### Effort & priority legend

- **Effort:** S ≈ 0.5 day, M ≈ 1 day, L ≈ 1.5 days. Anything looking
  larger than L should be split.
- **Priority:**
  - **P0** — required to ship the take-home end-to-end (database, auth,
    booking happy paths).
  - **P1** — strongly desired polish (admin UI, full i18n parity,
    README).
  - **P2** — nice-to-have, skip if time-pressed.

---

## 2. Feature table

| ID  | Title                                     | Branch                          | Scope (one sentence)                                                                                | User stories                                          | Depends on    | Acceptance / verify                                                                                                                                                                                                       | Effort | Priority |
| --- | ----------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| F01 | Database foundation                       | `feat/db-foundation`            | Docker Compose Postgres + Prisma schema (12 tables incl. RBAC + `doctor_departments` M:N) + first migration with 4 raw-SQL CHECK constraints + per-table seed split (no doctor/schedule/appointment seed) + shared `PrismaService`. | E1 (data model)                                       | —             | `pnpm db:up && pnpm prisma migrate dev && pnpm db:seed` succeeds; Prisma Studio shows populated tables; `pnpm type-check && pnpm build` green.                                                                              | M      | P0       |
| F02 | Backend auth core + auth log              | `feat/auth-backend`             | NestJS `auth/` module: JWT verify (jose), guards, error filter, `POST /auth/resolve`, `POST /auth/signout`. Loads `user.role.policies` per request and exposes `permissionCodes[]` on the request context for `PermissionsGuard` / `@RequirePermission()`. Resolves ADMIN, STAFF, and DOCTOR (DOCTOR carries `schedule.manage`). Adds the append-only `auth_logs` table (forward migration `add_auth_log`) and an `AuthLogService` that records `SIGN_IN_SUCCESS` / `SIGN_IN_FAILED` / `PERMISSION_DENIED` / `SIGN_OUT` events with optional IP + User-Agent forensic columns. | US-2.3, US-2.4, US-2.5, US-2.6, US-2.7, US-3.1        | F01           | New auth unit + e2e specs pass; `/auth/resolve` + `/auth/signout` covered by Swagger; protected stub returns `401` without cookie, `200` with valid JWT minted via test helper, `403 INSUFFICIENT_PERMISSION` when permission missing; every sign-in success / failure / permission-denial / sign-out writes exactly one row to `auth_logs`. | M      | P0       |
| F03 | Frontend NextAuth wiring + sign-in        | `feat/auth-frontend`            | Install NextAuth v5, Google provider, `/signin` page, role-aware home dispatcher, sign-out (calls F02's `POST /auth/signout` then clears the cookie). Configures NextAuth `session.maxAge` + `session.updateAge` for sliding-window renewal — no custom refresh-token model. No patient sign-in. | US-2.1, US-2.2, US-3.4                                | F02           | Manual: Google sign-in lands on `/[locale]`, role dispatcher routes ADMIN to the admin dashboard, STAFF to the clinic dashboard, and DOCTOR to the schedule editor; sign-out calls the BE audit endpoint then clears cookie; `/signin?error=email_unverified` renders localized error. | M      | P0       |
| F05 ✅ | Doctors & departments directory           | `feat/directory`                | Read-only BE endpoints + minimal FE list/detail pages for departments and doctors. Doctor lists include the doctor's department affiliations (via `doctor_departments`); a doctor may appear under multiple departments. **Shipped:** also delivered the app shell (sidebar + header + breadcrumb), the `lib/api` transport foundation, paginated list endpoints (`Paginated<T>` envelope), and the HS256 session-JWT workaround tracked as FU-01. | US-4.1, US-4.2, US-4.3                                | F02, F03      | Manual: `/departments` and `/doctors` list seeded data; doctor detail page renders affiliations with the `isPrimary` flag; STAFF can view (gated on `doctor.list` / `doctor.read`); ADMIN and DOCTOR receive `403 INSUFFICIENT_PERMISSION` unless granted; pagination + filter survive page navigation.                  | M      | P0       |
| F06 | Doctor schedule CRUD                      | `feat/schedules`                | BE `/doctors/:id/schedules` CRUD + UI for users with `schedule.manage` (STAFF unrestricted; DOCTOR limited to own schedules via service-layer scope). Each schedule carries `departmentId`; the doctor must be affiliated with that department. Three DB CHECK constraints back-stop window/break validity. | US-5.1, US-5.2, US-5.3, US-5.4                        | F05           | Manual: a STAFF user creates a schedule with `departmentId`; overlap returns `409`; mismatched department returns `409 DOCTOR_NOT_IN_DEPARTMENT`; edit & delete work; a DOCTOR can manage only their own schedules (else `403 INSUFFICIENT_PERMISSION_SCOPE`); a user without `schedule.manage` (e.g. ADMIN by default) returns `403 INSUFFICIENT_PERMISSION`. | L      | P0       |
| F07 | Appointment types + slot finder           | `feat/slots`                    | BE-only: `/appointment-types` and `/doctors/:id/slots` (requires `departmentId`). No UI. Gated on `appointment.create`. | US-6.1, US-6.2                                        | F06           | Unit tests cover slot grid arithmetic, break-window exclusion, and exclusion of past/booked slots; manual `curl` against seed data returns expected slots; mismatched `(departmentId, type)` returns `400 DEPARTMENT_TYPE_NOT_ALLOWED`.                                                                                          | M      | P0       |
| F08 | Staff booking + lifecycle                 | `feat/staff-booking`            | BE `POST /patients` (walk-in), `GET /patients?q=`, `POST /appointments` (inherits `departmentId` from the chosen schedule; validates `(departmentId, appointmentType)` against `department_appointment_types`), `GET /appointments`, `GET /appointments/:id`, `POST /appointments/:id/cancel` + booking & list UI. **STAFF-only by default** — ADMIN does not hold `appointment.*` in the seeded baseline; grant via `permission.assign`. **No ownership filter** — every STAFF can act on every patient. | US-7.1, US-7.2, US-7.3, US-7.4, US-8.1, US-8.2, US-8.3 | F07           | Manual: STAFF books for any patient; conflicting double-book returns `409 SLOT_TAKEN`; mismatched `(departmentId, type)` returns `400 DEPARTMENT_TYPE_NOT_ALLOWED`; cancel frees slot; the `appointments_end_after_start` DB CHECK back-stops `endAt > startAt`.                                                                                | L      | P0       |
| F11 | Admin user + role/permission management   | `feat/admin-users`              | BE `/admin/users` (list, invite, disable, enable — invite path supports DOCTOR by creating the User + Doctor + `doctor_departments` rows transactionally), `/admin/roles/:id/policies` (grant/revoke), optional `/admin/roles` (create custom role, P2 — requires `role.manage`) + minimal `(app)/admin/users` & `(app)/admin/roles` UI. ADMIN starts narrow (5 permissions) and may grant additional capabilities to themselves or others via `permission.assign`. **Single feature — no API/UI split.** | US-11.1, US-11.2, US-11.3, US-11.5 (+ US-11.6 P2)     | F03, F08      | Manual: ADMIN invites a new STAFF email; new staff signs in successfully; ADMIN disables them; subsequent sign-in returns `USER_DISABLED`; self-disable is blocked; ADMIN grants `appointment.cancel` to STAFF and observes the new permission on next request; ADMIN cannot revoke `permission.assign` from the ADMIN role. | L      | P1       |
| F12 | i18n parity + README                      | `chore/i18n-readme`             | Audit all strings to `messages/*.json`, add `Roles.*` / `Permissions.*` namespaces, regenerate keys, write project `README.md`. | US-12.1, US-12.2                                      | F11           | `pnpm type-check` green; manual lang switch shows no raw English on TH; README walkthrough takes a fresh clone to a running app in <15 min.                                                                                | M      | P1       |

> **F04, F09, F10 were removed when patient sign-in / self-service was scoped out (2026-05-24).** The feature IDs are intentionally left as gaps — IDs stay stable so commit and PR references continue to resolve.

---

## 3. Detailed feature breakdowns

Order matches the table. Each section documents *why* the feature is its
own PR, the file footprint, migrations, and a reviewer smoke test.

### F01 — Database foundation (P0, M)

**Why a standalone feature**

Schema choices propagate into every subsequent module's types via the
Prisma client. Landing schema + migration + seed alone makes the data
contract reviewable in isolation and gives every later PR a stable
baseline to import from.

**Files expected to change**

- `docker-compose.yml` — Postgres 16 service, named volume, exposed
  `5432`.
- `apps/api/prisma/schema.prisma` — full P0 schema with **12 tables**:
  - **Enums:** `AppointmentStatus`, `AppointmentType`, `DayOfWeek`,
    `Gender` (MALE, FEMALE only), `BloodGroup` (8 ABO/Rh + UNKNOWN).
  - **RBAC tables:** `roles`, `permissions`, `policies`.
  - **Clinical tables:** `users`, `patients`, `departments`,
    `department_appointment_types` (per-department allowed types — the
    booking rules table), `doctors`, `doctor_departments` (M:N join with
    `is_primary`), `doctor_schedules`, `appointments`.
  - The `Role` Prisma enum has been **removed**; `User.role_id` is an FK
    to the `roles` table.
  - There is **no `staff_domains` table** — the allowlist is env-driven
    (`STAFF_ALLOWED_DOMAINS`).
  - `Doctor` has **no `department_id` column** — affiliation is in
    `doctor_departments` (M:N). `DoctorSchedule` carries its own
    `department_id` (required); booking inherits
    `Appointment.department_id` from the chosen schedule.
  - `Doctor.identification_no` is required (parity with
    `Patient.identification_no`).
  - `Patient` carries multilingual names (`first_name_en` /
    `last_name_en` required, `first_name_th` / `last_name_th` nullable)
    and an optional unique `email` (lowercased via `normalizeEmail()`).
  - `Patient.hn @db.VarChar(9)` with a raw-SQL CHECK
    `^[0-9]{7,9}$` (Prisma 5 cannot express CHECK natively).
  - `User.email` is `@unique` and **stored lowercased** (enforced via
    application-layer `normalizeEmail()` helper, since Prisma can't
    express a citext column natively without a migration extension).
  - `User.role_id` is NULLABLE only to permit the bootstrap insert of
    the super-admin (the chicken-and-egg between `roles.created_by` and
    `users.role_id`); every other user has a non-null `role_id` enforced
    at the API DTO layer.
  - Patients have **no `User` link** — patients do not sign in.
  - `Appointment.reason` is `String?` mapped to Postgres `@db.Text` — no
    length cap.
  - Appointment audit columns are `created_by` (required), `updated_by`
    (nullable), `cancelled_by` (nullable) — all uniform with every other
    table. **Appointments do NOT carry `deleted_at` / `deleted_by`** —
    `status=CANCELLED` replaces soft-delete.
  - Every other table carries the full audit cluster: `created_at`,
    `created_by`, `updated_at`, `updated_by` (nullable), `deleted_at`
    (nullable), `deleted_by` (nullable).
- `apps/api/prisma/migrations/<timestamp>_init/migration.sql` — generated
  by `prisma migrate dev --name init`, with **4 raw-SQL CHECK
  constraints appended at the bottom** (Prisma 5 cannot express CHECK
  natively):
  1. `patients_hn_format` — `CHECK (hn ~ '^[0-9]{7,9}$')`.
  2. `doctor_schedules_window_valid` —
     `CHECK (start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute)`.
  3. `doctor_schedules_break_valid` — break window (if set) lies inside
     the working window with `break_start < break_end`.
  4. `appointments_end_after_start` — `CHECK (end_at > start_at)`.
- `apps/api/prisma/seed/` — per-table seeders with an `index.ts`
  orchestrator. RBAC seeders: `roles.ts` (3 rows: ADMIN, STAFF, DOCTOR),
  `permissions.ts` (16 code-defined rows), `policies.ts` (17 rows:
  ADMIN→5, STAFF→11, DOCTOR→1). Clinical seeders: `super-admin.ts`,
  `users.ts`, `departments.ts`, `department-appointment-types.ts`,
  `patients.ts`. **Seed totals:**
  - 5 users — 1 super-admin (nil UUID) + 2 ADMIN
    (`admin1@gmail.com`, `admin2@gmail.com`) + 2 STAFF
    (`staff1@gmail.com`, `staff2@gmail.com`).
  - 10 departments — Cardiology, Internal Medicine, Pediatrics,
    Orthopedics, Obstetrics & Gynecology, Dermatology, Ophthalmology,
    Otolaryngology (ENT), General Surgery, Emergency Medicine.
  - 35 `department_appointment_types` rows — per-department allowed
    types matrix.
  - 10 patients — HN `26000001`…`26000010` (`<YY><sequence>` 8-digit
    format), emails `patient<N>@mailsac.com`, multilingual names mix,
    5 MALE + 5 FEMALE, blood-group mix incl. `UNKNOWN`.
  - **No DOCTOR users, doctors, doctor_schedules, or appointments are
    seeded** — those rows are created via application workflows in
    later features (admin invite for Doctor+User+doctor_departments;
    schedule editor for `DoctorSchedule`; staff booking for
    `Appointment`).
- **RBAC bootstrap (Option C):** `roles.created_by` FKs to `users.id`
  and `users.role_id` FKs to `roles.id`, so neither side can be inserted
  first. The seed flow is:
  1. Insert the super-admin user with `role_id = NULL`.
  2. Seed `roles`, `permissions`, `policies` using the super-admin's id
     as `created_by`.
  3. Back-fill the super-admin's `role_id` with the ADMIN role id
     (`assignSuperAdminRole`).
- `apps/api/src/common/normalize-email.ts` — shared
  `normalizeEmail(input: string): string` helper (`input.trim().toLowerCase()`)
  used by every code path that writes or looks up an email.
- `apps/api/src/prisma/prisma.module.ts`, `prisma.service.ts` — global
  `PrismaService` with `onModuleInit` connect and `enableShutdownHooks`.
- `apps/api/src/app.module.ts` — register `PrismaModule` as a global.
- `apps/api/package.json` — exact-pin add `prisma@5.22.0`,
  `@prisma/client@5.22.0`; add `prisma.seed` config pointing at
  `ts-node` (already present).
- Root `package.json` — add npm-scripts `db:up`, `db:down`, `db:seed`,
  `prisma` proxies (no version bumps).
- `.env.example` (apps/api) — `DATABASE_URL`,
  `STAFF_ALLOWED_DOMAINS=gmail.com`, `INTERNAL_API_SECRET`,
  `NEXTAUTH_SECRET`.

**Migration / breaking-change notes**

- This is the **first migration**. Reviewers running on an existing
  database must drop and recreate the dev DB — call this out in the PR
  description's `## What's changed`.
- **Schema-regen flow** when iterating during development:
  1. Drop the local Postgres schema (or `pnpm db:down && pnpm db:up`).
  2. Delete the `apps/api/prisma/migrations/<timestamp>_init/` folder.
  3. `pnpm --filter @his/api prisma migrate dev --name init` —
     regenerates the migration WITHOUT the CHECK constraints.
  4. **Append the 4 CHECK constraints to the bottom of the new
     `migration.sql`** (HN format + 2 DoctorSchedule + 1 Appointment).
  5. `pnpm --filter @his/api prisma migrate reset` — applies the
     migration with CHECKs and reseeds.

**Manual smoke test**

```bash
docker compose up -d postgres        # via pnpm db:up
pnpm --filter @his/api prisma migrate dev
pnpm --filter @his/api db:seed
pnpm --filter @his/api prisma studio  # verify rows in each table
```

---

### F02 — Backend auth core + auth log (P0, M)

**Why a standalone feature**

The auth contract (`POST /auth/resolve` + JWT verification + the
permission guard) is the single most reviewable security surface.
Isolating it from any frontend wiring lets the reviewer focus on
cryptographic correctness, role resolution, and the RBAC enforcement
layer. Bundling the append-only `auth_logs` table in the same PR keeps
the audit trail wired up from day one — the guards and the resolve
service are the producers, so co-landing them avoids a "logs were added
later but the auth flow already shipped" gap.

**Files expected to change**

- `apps/api/src/auth/` — `auth.module.ts`, `auth.controller.ts`,
  `auth.service.ts`, `auth.swagger.ts` (composite Swagger decorators per
  CLAUDE.md §6), `auth.const.ts` (`SESSION_COOKIE_NAMES`,
  `INTERNAL_SECRET_HEADER`), `auth.types.ts` (`SessionTokenPayload`,
  `ResolveResult`), `session-token.ts` (HS256 verify + cookie / Bearer
  parsers via `jose`), `permissions.ts` (`PERMISSION` catalog),
  `roles.ts` (`ROLE` catalog + `SIGN_IN_ELIGIBLE_ROLES` +
  `DEFAULT_ROLE_PERMISSIONS`), `guards/` (`jwt.guard.ts`,
  `permissions.guard.ts`, `internal-secret.guard.ts`), `decorators/`
  (`public.decorator.ts`, `internal-route.decorator.ts`,
  `require-permission.decorator.ts`, `current-user.decorator.ts`),
  `dto/resolve.dto.ts` (class-validator DTO for the Google profile).
- `apps/api/src/auth-log/` — `auth-log.module.ts` (`@Global()`),
  `auth-log.service.ts` (`record()` + four convenience writers,
  `await`-ed with internal try/catch so a DB outage never breaks auth),
  `auth-log.const.ts` (`AUTH_LOG_EVENT` typed catalog + truncation
  limits), `auth-log.types.ts` (`AuthLogContext`, `AuthLogPayload`),
  `request-context.ts` (extracts ip / UA / path / method from the
  Express request; reads `X-Forwarded-For` first).
- `apps/api/src/common/` — `errors.ts` (`ErrorCode` catalog incl.
  `NOT_INVITED`, `USER_DISABLED`, `INSUFFICIENT_PERMISSION`,
  `AUTH_INTERNAL_FORBIDDEN`, `EMAIL_UNVERIFIED`, `INTERNAL_ERROR`),
  `app-exception.ts` (`AppException` with `code` + `details`),
  `filters/http-exception.filter.ts` (global filter producing the
  shared `{ statusCode, code, message, details? }` envelope; coerces
  Nest `HttpException` and class-validator arrays into the same shape).
- `apps/api/src/app.module.ts` — register `HttpExceptionFilter` as
  `APP_FILTER`; register `InternalSecretGuard`, `JwtGuard`, and
  `PermissionsGuard` (in that order) as `APP_GUARD` so every endpoint
  is protected by default; import `AuthLogModule` and `UsersModule`.
- `apps/api/src/health/health.controller.ts` — mark `@Public()` so the
  liveness check bypasses `JwtGuard`.
- `apps/api/src/users/` — `users.module.ts`, `users.service.ts`
  (`findActiveById`, `findByEmail`, `isEmailDisabled`, `linkGoogleSub`;
  loads `role.policies.permission` with `deletedAt: null` filter so
  revokes take effect on the next request), `users.types.ts`
  (`AuthenticatedUser`).
- `apps/api/prisma/schema.prisma` — adds the `AuthLogEvent` enum and
  the `AuthLog` model (append-only — no `created_by` / `updated_*` /
  `deleted_*`). Inverse `User.authLogs` added.
- `apps/api/prisma/migrations/<timestamp>_add_auth_log/migration.sql` —
  forward migration on top of the F01 init. Plain CREATE TYPE +
  CREATE TABLE — no CHECK constraints.
- `apps/api/src/auth/*.spec.ts` + `apps/api/src/auth-log/auth-log.service.spec.ts`
  — unit specs covering the resolve flow, JWT helpers, permissions
  guard (incl. denial logging), and the auth-log writer (normalisation,
  truncation, error swallowing).
- `apps/api/test/auth.e2e-spec.ts` + `test/jest-e2e.json` +
  `test/utils/sign-jwt.ts` — e2e covers ADMIN/STAFF/DOCTOR resolve
  happy paths, the four rejection codes, `GET /me`, the
  `permission.assign`-gated stub, and one assertion per `AuthLogEvent`
  verifying the expected row hits `auth_logs`.
- `apps/api/package.json` — exact-pin add `jose@5.9.6`.

**Permission enforcement**

- The `JwtGuard` decodes the cookie and attaches `{ userId, roleCode }`
  to the request. The `PermissionsGuard` then loads
  `user.role.policies[].permission.code` via Prisma **once per request**
  (cached on the request context — Nest's request-scoped DI or a
  request-bound interceptor) and exposes the codes as
  `request.user.permissionCodes: string[]`. The
  `@RequirePermission(PERMISSION.SCHEDULE_MANAGE)` decorator checks the
  required code against that set.
- Handlers with no `@RequirePermission()` only need a valid session
  (e.g. `POST /auth/signout`, `GET /me`).
- Permission denials return `403` with `code=INSUFFICIENT_PERMISSION`
  and `details: { required: ['<code>'], held: ['<code>', ...] }`, and
  write a `PERMISSION_DENIED` row to `auth_logs` (US-2.6) before the
  exception is thrown.
- **App-layer scope (DOCTOR own-schedule restriction):** the coarse
  `schedule.manage` permission is held by both STAFF and DOCTOR. The
  schedule CRUD service (F06) MUST additionally enforce
  `if caller.role === DOCTOR then schedule.doctorId === caller.doctor.id`;
  otherwise reject with `403 INSUFFICIENT_PERMISSION_SCOPE`. The auth
  layer only checks the code; the scope check belongs to the feature
  service.

**Auth-log behaviour (US-2.6 / US-2.7)**

- `AuthService.resolve()` `await`s an `AuthLogService.logSignInSuccess`
  (happy path) or `logSignInFailure` (each rejection: `EMAIL_UNVERIFIED`
  → `USER_DISABLED` → `NOT_INVITED` → role-not-eligible). The
  `reason` column carries the stable `ErrorCode`.
- `PermissionsGuard` becomes async and `await`s
  `AuthLogService.logPermissionDenied(userId, email, required, held,
  context)` before throwing `403`. `userId` and `email` are `null`
  when the JWT decoded but no user row is attached (defensive).
- `POST /auth/signout` writes a `SIGN_OUT` row, returns `204`, and does
  NOT clear any cookie (the FE owns cookie clearing via NextAuth's
  `signOut()`).
- Writes are `await`-ed so the row is guaranteed before the HTTP
  response, BUT the underlying Prisma `create` is wrapped in
  `try/catch` inside `AuthLogService` — a log failure logs at `ERROR`
  level and returns; the auth response is never broken by an audit
  failure.

**Migration / breaking-change notes**

- One **forward migration** on top of the F01 init:
  `apps/api/prisma/migrations/<timestamp>_add_auth_log/migration.sql`.
  Adds the `AuthLogEvent` enum and the `auth_logs` table with three
  indexes (`(user_id, created_at)`, `(event, created_at)`, `(email)`)
  and one FK to `users` (`ON DELETE NO ACTION` so audit rows survive
  user soft-delete). No CHECK constraints, no data backfill — apply
  with `pnpm --filter @hospital/api prisma migrate dev`.
- Reviewers already on `feat/db-foundation` schemas need to re-run
  `prisma migrate dev` (or `migrate reset`) to pick up the new table.

**Manual smoke test**

```bash
# Mint a test JWT (helper script in test/utils/sign-jwt.ts) for a seeded
# STAFF user and call:
curl -i -H "Cookie: next-auth.session-token=<jwt>" \
  http://localhost:3001/api/v1/me

# Resolve flow (use a seeded STAFF address):
curl -i -X POST http://localhost:3001/api/v1/auth/resolve \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $INTERNAL_API_SECRET" \
  -d '{ "email": "staff1@gmail.com", "googleSub": "g-123",
        "emailVerified": true, "name": "Pim Sukjai", "picture": null }'

# Sign-out (writes a SIGN_OUT row, no cookie clearing):
curl -i -X POST http://localhost:3001/api/v1/auth/signout \
  -H "Cookie: next-auth.session-token=<jwt>"

# Inspect the audit trail:
psql "$DATABASE_URL" \
  -c "SELECT event, email, reason, created_at
        FROM auth_logs
        ORDER BY created_at DESC LIMIT 10;"
```

Expected: `/auth/resolve` returns `200` with `{ userId, roleCode,
permissionCodes }` and writes one `SIGN_IN_SUCCESS` row. A
not-pre-created email returns `code=NOT_INVITED` and writes a
`SIGN_IN_FAILED` row with `reason='NOT_INVITED'`. A request missing the
internal secret header returns `401 AUTH_INTERNAL_FORBIDDEN`. A
permission-gated stub returns `403 INSUFFICIENT_PERMISSION` and writes
a `PERMISSION_DENIED` row with the `required` + `held` arrays.
`/auth/signout` returns `204` and writes a `SIGN_OUT` row.

---

### F03 — Frontend NextAuth wiring + sign-in (P0, M)

**Why a standalone feature**

NextAuth v5 is still beta — pinning it precisely and isolating its
config in one PR makes future upgrades trivially revertable. Also gives
the reviewer a clean diff for the cookie strategy and rewrite-based
same-origin proxying.

**Files expected to change**

- `apps/web/src/auth.ts` — NextAuth v5 config (Google provider, JWT
  strategy, HS256 secret, `signIn` callback calling backend
  `/auth/resolve`). Session lifetime configured with `session.maxAge`
  (hard ceiling, e.g. 7 days) and `session.updateAge` (sliding-window
  renewal interval, e.g. 1 hour) — see the **Session renewal model**
  convention in `docs/user-stories.md`. No custom refresh-token table;
  the JWT cookie auto-renews on activity within `maxAge`.
- `apps/web/src/middleware.ts` — locale + auth middleware; redirects
  unauthenticated visits to `/[locale]/signin`.
- `apps/web/src/app/[locale]/signin/page.tsx` — single "Continue with
  Google" button, localized error mapping
  (`email_unverified`, `user_disabled`, `not_invited`, `internal`).
- `apps/web/src/app/[locale]/page.tsx` — convert to role dispatcher
  (server component that reads session and redirects/render-branches).
- `apps/web/src/app/api/auth/[...nextauth]/route.ts` — NextAuth route
  handler.
- `apps/web/next.config.ts` — confirm `/api/be/:path*` rewrite to
  `${process.env.BACKEND_INTERNAL_URL}/api/v1/:path*`.
- `apps/web/src/lib/server/session.ts` — `getServerSession()` helper +
  `requireSession()` for server components.
- `apps/web/messages/en.json`, `messages/th.json` — sign-in/sign-out and
  error strings; regenerate `keys.generated.ts`.
- `apps/web/package.json` — exact-pin add `next-auth@5.0.0-beta.27`.
- `apps/web/.env.example` — `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
  `NEXTAUTH_SECRET`, `BACKEND_INTERNAL_URL=http://localhost:3001`,
  `INTERNAL_API_SECRET`.

**Migration / breaking-change notes**

- Reviewers need a Google OAuth client; document creation steps in the
  PR description (Authorized redirect URI:
  `http://localhost:3000/api/auth/callback/google`).
- The shared `NEXTAUTH_SECRET` must match the API container's env.

**Manual smoke test**

1. `pnpm dev`.
2. Open `http://localhost:3000` → redirects to `/en/signin`.
3. Click "Continue with Google" → complete OAuth. The successful resolve
   writes a `SIGN_IN_SUCCESS` row to `auth_logs` (F02).
4. Land on `/en` (role dispatcher).
5. Click "Sign out" — the FE calls `POST /auth/signout` first (writes a
   `SIGN_OUT` row to `auth_logs`) and then clears the cookie via
   NextAuth's `signOut()` → back to `/en/signin`.
6. Visit `/en/signin?error=email_unverified` directly → localized error
   visible.
7. Verify the audit trail in Prisma Studio or psql:
   `SELECT event, email, reason FROM auth_logs ORDER BY created_at DESC
   LIMIT 5;` should show the `SIGN_IN_SUCCESS` and `SIGN_OUT` rows from
   steps 3 and 5.

---

### F05 — Doctors & departments directory (P0, M) ✅ shipped

**Status:** shipped on `feat/directory`. Commit chain:
- `feat(api): add departments + doctors directory endpoints (F05)`
- `feat(web): app shell + F05 directory pages + lib/api foundation`
- `docs: add follow-ups with FU-01 JWE migration plan`
- `feat(api): paginate F05 list endpoints with shared envelope`
- `feat(web): paginate F05 directory pages with shared PaginationControl`
- `refactor(web): move sidebar collapse toggle from header to sidebar footer`

**Why a standalone feature**

The directory is consumed by every booking flow. Landing it
read-only-first lets the reviewer validate listings without yet
worrying about mutation flows.

**What actually shipped (delta from the original brief)**

- **App shell co-shipped.** F05 was the first feature with multi-page UI,
  so the protected layout chrome landed here:
  `apps/web/src/components/app-shell/` (sidebar with permission-aware
  nav catalog, header with URL-derived breadcrumb + locale switcher +
  user-menu dropdown) + `apps/web/src/app-shell/` (catalogs + config).
  Wraps every authed route via `apps/web/src/app/[locale]/(app)/layout.tsx`.
  Pre-existing role landing pages (`/admin`, `/staff`, `/me/schedule`)
  moved into the `(app)` route group. Sidebar is collapsible to a
  64px mini-rail on md+ and a temporary drawer on xs/sm; the collapse
  chevron sits at the bottom of the sidebar itself.
- **lib/api foundation.** Introduced `apps/web/src/lib/api/` as the FE
  transport layer (`server-fetch.ts` exposing `internalFetch` +
  `userFetch`, `errors.ts` with `ApiError` + `readErrorEnvelope`,
  per-entity `<entity>.api.ts`). All later features (F06/F07/F08/F11)
  build on top of these helpers — see CLAUDE.md §5a/§5b.
- **Pagination on every list endpoint.** Out of scope in the original
  F05 brief, but the directory would have returned every active
  doctor/department on one call otherwise. Now wired with the shared
  `Paginated<T>` envelope and the `PaginationControl` component — see
  CLAUDE.md §8.
- **HS256 session JWT workaround.** F05 was the first time a real
  NextAuth cookie reached the BE `JwtGuard`, surfacing that Auth.js v5
  defaults to JWE encryption while the BE verifier expects HS256-signed
  JWS. Worked around on the FE by overriding `jwt.encode` / `jwt.decode`
  in `apps/web/src/auth.ts`. Proper alignment tracked in
  `docs/follow-ups.md` as **FU-01**.
- **Route group renamed.** The original brief used `(staff)` for the
  directory pages; landed as `(app)` because the same shell wraps
  ADMIN, STAFF, and DOCTOR landing pages — no per-role groups.

**Files shipped**

Backend (`apps/api/src/`):
- `departments/{module,controller,service,types,swagger}.ts` +
  `departments/dto/department.dto.ts`. `GET /departments` (paginated,
  `doctor.list`); `GET /departments/:id/doctors` (paginated,
  `doctor.list`, returns `isPrimary` from the join).
- `doctors/{module,controller,service,types,swagger}.ts` +
  `doctors/dto/doctor.dto.ts`. `GET /doctors` (paginated + optional
  `?departmentId`, `doctor.list`); `GET /doctors/:id` (`doctor.read`,
  affiliations + schedule count).
- `common/pagination/` — `PaginationQueryDto`, `Paginated<T>`,
  `PaginatedDto(ItemDto)` Swagger factory, helpers.

Frontend (`apps/web/src/`):
- `components/app-shell/` (5 chrome components) +
  `app-shell/` (catalogs: `nav-items.*`, `breadcrumb-labels.ts`,
  `layout.const.ts`).
- `components/department/{DepartmentCardLink,DepartmentChipLink}.tsx`,
  `components/doctor/{DoctorListFilter,DoctorListRow}.tsx`,
  `components/shared/PaginationControl.tsx`.
- `app/[locale]/(app)/{departments,doctors,doctors/[id]}/page.tsx`.
- `lib/api/{server-fetch,errors,auth.api,department.api,doctor.api,doctor.const,pagination,pagination.const}.ts`.
- `lib/utils/{parse,initials}.ts` — generic helpers extracted from
  duplicated inline copies.
- `types/{auth,department,doctor,pagination}.types.ts`.
- `messages/{en,th}.json` — new `Nav`, `Breadcrumb`, `UserMenu`,
  `Directory.*`, `Pagination` namespaces; regenerated
  `i18n/keys.generated.ts`.

**Migration / breaking-change notes**

- None — read-only against existing schema. Reads from
  `doctor_departments` rather than a `Doctor.departmentId` column
  (which doesn't exist).
- Frontend: `apps/web` gained `jose@5.9.6` for the HS256 override (see
  FU-01).

**Manual smoke test**

1. Sign in as a seeded STAFF user. Lands on `/staff` (placeholder
   dashboard) inside the shell. Sidebar shows Dashboard / Departments /
   Doctors. The doctors list is empty until F11 invites land — the
   empty state explains this.
2. `/departments` lists the seeded departments (paginated 20/page).
   Clicking a card jumps to `/doctors?page=1&departmentId=<id>`.
3. `/doctors?departmentId=<id>` filters to doctors with a
   `doctor_departments` row for that department. Filter dropdown +
   pagination preserve each other across navigation.
4. `/doctors/<id>` renders detail incl. all affiliations with the
   `isPrimary` flag.
5. Sign in as a seeded ADMIN — `/api/be/v1/doctors` returns
   `403 INSUFFICIENT_PERMISSION` because `doctor.list` is not in the
   ADMIN baseline. The sidebar hides the Doctors / Departments items
   for ADMIN.
6. Sidebar collapse chevron (bottom of sidebar, md+) toggles the
   mini-rail. Mobile (xs/sm) uses the header hamburger to open a
   temporary drawer.
7. Once a DOCTOR is invited (via F11), signing in routes them to
   `/me/schedule` (still placeholder until F06).

---

### F06 — Doctor schedule CRUD (P0, L)

**Why a standalone feature**

Schedules drive the slot finder. Implementing them in their own PR
isolates overlap-validation logic and the recurrence model from the
appointment domain.

**Endpoints**

- `GET /doctors/:id/schedules` — list schedules for a doctor.
- `POST /doctors/:id/schedules` — create a schedule (carries required
  `departmentId`, optional `breakStartMinute` / `breakEndMinute`,
  `acceptsBooking`).
- `PATCH /schedules/:id` — partial update.
- `DELETE /schedules/:id` — remove.

**Required permission:** `schedule.manage` (held by STAFF and DOCTOR).
ADMIN does NOT hold it by default — grant via `permission.assign` if
needed.

**Service-layer scope (CRITICAL):** when `caller.role === DOCTOR`, every
mutation and read MUST satisfy `schedule.doctorId === caller.doctor.id`;
otherwise the service returns `403 INSUFFICIENT_PERMISSION_SCOPE`. STAFF
gets the unrestricted form of the same permission.

**Validation:**

- `departmentId` must appear in the doctor's `doctor_departments`
  affiliations; otherwise reject with `DOCTOR_NOT_IN_DEPARTMENT`.
- Window math: `0 <= startMinute < endMinute <= 1440`; break window (if
  set) lies inside `(startMinute, endMinute)` with
  `breakStart < breakEnd`. These DTO checks mirror the DB CHECKs
  (`doctor_schedules_window_valid`, `doctor_schedules_break_valid`),
  which back-stop bypassed validation.

**Files expected to change**

- `apps/api/src/schedules/` — module, controller, service, DTOs
  (`create-schedule.dto.ts`, `update-schedule.dto.ts`), `swagger/`.
  All endpoints declare `@RequirePermission('schedule.manage')`.
- `apps/api/src/schedules/schedule.validation.ts` — overlap detection
  + department-affiliation check, covered by unit tests.
- `apps/api/src/schedules/schedule.scope.ts` — helper that enforces
  the DOCTOR own-doctor scope rule for every mutation/read.
- `apps/web/src/app/[locale]/(app)/doctors/[id]/schedule/page.tsx` —
  list grouped by weekday (and per-department within a day).
- `apps/web/src/app/[locale]/(app)/me/schedule/page.tsx` — the
  DOCTOR own-schedule view (uses the same component, but the route
  resolves `:id` from `session.doctor.id`).
- `apps/web/src/app/[locale]/(app)/doctors/[id]/schedule/_components/`
  — add/edit dialog (with department selector populated from the
  doctor's affiliations), delete confirm dialog.
- `apps/web/src/lib/api/schedules.ts` — typed client.

**Migration / breaking-change notes**

- None — uses existing `doctor_schedules` model (which already carries
  `departmentId` and break columns from F01).

**Manual smoke test**

1. As a STAFF user, open a doctor's schedule page.
2. Add a Monday 09:00–12:00 schedule on a department the doctor is
   affiliated with → appears in list.
3. Try to add an overlapping Monday 11:00–13:00 → `409 SCHEDULE_OVERLAP`.
4. Try `departmentId` outside the doctor's affiliations →
   `409 DOCTOR_NOT_IN_DEPARTMENT`.
5. Edit start time to 08:30 → succeeds.
6. Delete the schedule → row gone; the UI warns first if future
   appointments exist (book one through F08 to exercise this).
7. As a DOCTOR user, open `/me/schedule` → see only own schedules.
   Try to `GET /doctors/<other>/schedules` →
   `403 INSUFFICIENT_PERMISSION_SCOPE`.
8. As an ADMIN (who lacks `schedule.manage`), the same `POST` returns
   `403 INSUFFICIENT_PERMISSION`.

---

### F07 — Appointment types + slot finder (P0, M)

**Why a standalone feature**

Pure backend, pure logic. Easiest possible review unit: a hardcoded
list and a deterministic slot computation tested entirely with unit
specs. No UI noise.

**Files expected to change**

- `apps/api/src/appointment-types/` — module, controller, `swagger/`,
  `appointment-type.const.ts` exporting the duration map.
- `apps/api/src/slots/` (or extend `doctors/`) —
  `slots.service.ts` computing the grid, `doctors.controller.ts`
  exposing `GET /doctors/:id/slots`.
- `apps/api/test/slots.spec.ts` — unit tests covering:
  - grid step matches duration,
  - past slots excluded,
  - **fully-past `date` parameter returns `[]` with HTTP 200 (never 400)**,
  - booked appointments exclude their slot,
  - cancelled appointments do NOT exclude their slot.

**Migration / breaking-change notes**

- None.

**Manual smoke test**

```bash
curl -s "http://localhost:3001/api/v1/doctors/<seed-doctor-id>/slots?date=2026-05-25&type=CONSULTATION" \
  -H "Cookie: next-auth.session-token=<jwt>" | jq
```

Expect chronological array; pick one and call the booking endpoint in
F08 to confirm exclusion.

---

### F08 — Staff booking + lifecycle (P0, L)

**Why a standalone feature**

The booking write path is the highest-risk surface (transactional
correctness, per-department type validation, conditional `reason` for
`PROCEDURE`, conflict detection). Bundling list/detail/cancel keeps the
staff "lifecycle" surface in one reviewable PR. If the diff grows too
large, split into F08a (BE) and F08b (FE).

**STAFF-only by default.** ADMIN does NOT hold any `appointment.*` /
`patient.*` permission in the seeded baseline; an ADMIN who needs to
book or manage patients must first grant the relevant permission(s) via
`permission.assign` (US-11.5).

**Files expected to change**

- `apps/api/src/appointments/` — module, controller, service, DTOs
  (`create-appointment.dto.ts`, `list-appointments.query.ts`,
  `cancel-appointment.dto.ts`), `swagger/` subfolder. Endpoints declare
  `@RequirePermission('appointment.create' | 'appointment.list' |
  'appointment.read' | 'appointment.cancel')` per route.
- `apps/api/src/appointments/appointments.service.ts` — transactional
  create with `Prisma.TransactionIsolationLevel.Serializable`, single
  retry on `40001`. `createdBy` is set from `session.userId`.
- **Booking acceptance** must:
  1. Inherit `Appointment.departmentId` from the chosen
     `DoctorSchedule` (the FE passes back the `departmentId` returned by
     the slot finder).
  2. Verify the chosen doctor has a `doctor_departments` row for
     `departmentId`; else `409 DOCTOR_NOT_IN_DEPARTMENT`.
  3. Verify `(departmentId, appointmentType)` exists in
     `department_appointment_types`; else `400 DEPARTMENT_TYPE_NOT_ALLOWED`.
  4. Re-validate the slot against active schedules
     (`(doctor_id, department_id, dayOfWeek)`-filtered) and existing
     non-cancelled appointments; on conflict return
     `409 SLOT_TAKEN`.
  5. Persist with `status=BOOKED`, `endAt = startAt + duration`. The
     DB CHECK `appointments_end_after_start` back-stops the math.
- `apps/api/src/patients/` — `POST /patients` (walk-in,
  `@RequirePermission('patient.create')`), `GET /patients?q=`
  (`@RequirePermission('patient.list')`). **No ownership filter** —
  every STAFF caller sees every patient. No `primary_staff_user_id` is
  recorded on creation. The walk-in payload omits `hn` — the service
  assigns one matching `^[0-9]{7,9}$`; the DB CHECK
  `patients_hn_format` back-stops format drift.
- `apps/api/test/appointments.e2e-spec.ts` — happy path, slot conflict
  (`409 SLOT_TAKEN`), conditional reason rule, mismatched
  department/type (`400 DEPARTMENT_TYPE_NOT_ALLOWED`), mismatched
  doctor/department (`409 DOCTOR_NOT_IN_DEPARTMENT`), cancel frees slot,
  permission denial for a caller missing the required code.
- `apps/web/src/app/[locale]/(app)/appointments/page.tsx` — list with
  filters (now includes `departmentId` filter).
- `apps/web/src/app/[locale]/(app)/appointments/[id]/page.tsx` —
  detail + cancel (renders department).
- `apps/web/src/app/[locale]/(app)/appointments/new/page.tsx` —
  booking wizard (patient search → department → doctor → type → date
  → slot). The wizard threads `departmentId` from step 2 through to
  the slot finder and booking call.
- `apps/web/src/lib/api/appointments.ts`,
  `apps/web/src/lib/api/patients.ts`.

**Migration / breaking-change notes**

- None — relies on the F01 schema (with `appointments.department_id`
  and `department_appointment_types` already in place).

**Manual smoke test**

1. As a STAFF user, open `/appointments/new`, search → results show any
   patient; pick one, pick a department + doctor +
   `CONSULTATION` + tomorrow + first slot, submit.
2. In a second tab repeat with the same slot → `409 SLOT_TAKEN` shown.
3. Open the new appointment detail → cancel → toast confirms.
4. Re-run step 2's request → `200` (slot freed).
5. Try `PROCEDURE` against a department that doesn't offer
   `PROCEDURE` (e.g. Emergency Medicine) →
   `400 DEPARTMENT_TYPE_NOT_ALLOWED`.
6. Try `PROCEDURE` without `reason` → validation error.
7. Repeat step 1 as an ADMIN user — `403 INSUFFICIENT_PERMISSION` (the
   ADMIN must first self-grant `appointment.create` via US-11.5 to
   proceed).

---

### F11 — Admin user + role/permission management (P1, L)

**Why a standalone feature**

ADMIN-only surface, dedicated guard, env-driven domain allowlist, and
the runtime policy CRUD that lets admins re-shape any role's
permissions without a deploy. All three warrant a single review pass
that exercises the `permission.assign` flow end-to-end. UI is optional
polish; the API is the cuttable contract.

**Permissions overview**

- The seeded permission catalog has **16** codes. ADMIN starts with **5**
  (`user.invite`, `user.disable`, `user.list`, `role.manage`,
  `permission.assign`). STAFF starts with **11** (clinic operations).
  DOCTOR starts with **1** (`schedule.manage` with app-layer
  own-doctor scope).
- ADMIN can grant additional capabilities (e.g. `appointment.create`)
  to themselves or others at runtime via `permission.assign`. This is
  how an ADMIN gains booking capability — there is no compile-time
  "ADMIN sees all" behavior.
- The custom-role-creation endpoint (US-11.6) lets admins introduce role
  variations (e.g. "Receptionist Lead") without code changes.

**Files expected to change**

- `apps/api/src/admin/` — module, controller, service, DTOs, `swagger/`.
- `apps/api/src/admin/admin.controller.ts` — user management:
  `POST /admin/users` (`@RequirePermission('user.invite')`) — supports
  `roleCode='DOCTOR'` by additionally creating the `Doctor` (1-1) and
  one `doctor_departments` row per `departmentIds` entry inside a single
  Prisma `$transaction`, with `isPrimary` set on the primary
  department; `GET /admin/users` (`user.list`),
  `POST /admin/users/:id/disable` (`user.disable`),
  `POST /admin/users/:id/enable` (`user.disable`); role + policy
  management: `POST /admin/roles/:id/policies` and
  `DELETE /admin/roles/:id/policies/:permissionId`
  (`@RequirePermission('permission.assign')`); optional
  `POST /admin/roles` (P2, `@RequirePermission('role.manage')`).
- `apps/api/src/auth/` — extend resolver to reject
  `deletedAt != null` (disabled) with `code=USER_DISABLED`; reject
  not-pre-created users with `code=NOT_INVITED`.
- `apps/api/src/admin/policy.service.ts` — lockout guard: rejects
  removing `permission.assign` from the ADMIN role with
  `code=CANNOT_REMOVE_LAST_PERMISSION_ASSIGN`. The simplest v1
  implementation is "if target role is ADMIN and permission is
  `permission.assign`, reject the revoke".
- `apps/api/test/admin-users.e2e-spec.ts` — invite (ADMIN, STAFF,
  DOCTOR), disable, self-disable guard, domain rejection.
- `apps/api/test/admin-policies.e2e-spec.ts` — grant + revoke,
  duplicate-grant idempotency, lockout guard, ADMIN-self-grant flow
  (e.g. ADMIN grants `appointment.create` to ADMIN, then can book).
- `apps/web/src/app/[locale]/(app)/admin/users/page.tsx` — list +
  invite + disable controls (with DOCTOR-specific sub-form for
  `doctorCode` / `medicalLicenseNo` / `identificationNo` /
  `departmentIds` / `primaryDepartmentId`).
- `apps/web/src/app/[locale]/(app)/admin/roles/page.tsx` — list roles,
  show permission grid (16 columns), toggle grants (only visible to
  users with `permission.assign`).

**Migration / breaking-change notes**

- None — uses the soft-delete cluster on `users` (the "disabled" state
  is `deletedAt != null` + `deletedBy = <admin>`) and the RBAC tables
  seeded by F01.
- If this feature is cut to API-only, document so in PR description and
  link the deferred UI as a follow-up.

**Manual smoke test**

1. As ADMIN, invite `colleague@gmail.com` with `roleCode=STAFF` → row
   appears in the list.
2. Sign in as that account (Google) → succeeds, lands on the staff
   dashboard.
3. Back as ADMIN, disable that user.
4. The disabled user signs out and tries to sign in again → blocked
   with `USER_DISABLED` error on `/signin?error=user_disabled`.
5. ADMIN attempts to disable self → `400 CANNOT_DISABLE_SELF`.
6. ADMIN navigates to `/admin/roles`, grants `appointment.cancel` to a
   STAFF role policy. After the grant, a newly-signed-in STAFF user can
   `POST /appointments/:id/cancel` successfully.
7. ADMIN revokes `appointment.cancel` from STAFF. The same STAFF user's
   next cancel attempt returns `403 INSUFFICIENT_PERMISSION`.
8. ADMIN attempts to revoke `permission.assign` from the ADMIN role →
   `409 CANNOT_REMOVE_LAST_PERMISSION_ASSIGN`.
9. ADMIN invites a DOCTOR user with `departmentIds=[<cardiology-id>]`
   and `primaryDepartmentId=<cardiology-id>` → the User + Doctor +
   `doctor_departments` rows are all created atomically. The new
   doctor signs in and lands on the schedule editor.

---

### F12 — i18n parity + README (P1, M)

**Why a standalone feature**

Bundling i18n cleanup with README authoring is convenient because both
are reviewer-facing polish, neither alters runtime behavior, and both
need a final pass after all features have shipped.

**Files expected to change**

- `apps/web/messages/en.json`, `apps/web/messages/th.json` — audit pass;
  ensure every visible string referenced.
- `apps/web/src/i18n/keys.generated.ts` — regenerated.
- `apps/web/src/app/[locale]/not-found.tsx`,
  `apps/web/src/app/[locale]/error.tsx` — verify locale-aware copy.
- Repo `README.md` — full setup walkthrough (see US-12.2).
- `docs/` — optionally add a short `decisions.md` linking to roadmap and
  user-stories; out of scope if time-pressed.

**Migration / breaking-change notes**

- None.

**Manual smoke test**

1. Fresh clone in `/tmp`:
   ```bash
   git clone <repo> /tmp/his-fresh && cd /tmp/his-fresh
   ```
2. Follow the README verbatim → reach a running app, sign in, book
   an appointment.
3. Switch language to TH — verify no raw English remains in primary
   flows (signin, doctors, booking, appointments list, admin user +
   roles screens).

---

## 4. Sequencing rationale

- **F01 → F02 → F03** is non-negotiable: schema (incl. RBAC tables and
  the doctor/department M:N) before backend auth + permission guard,
  backend auth before frontend wiring.
- **F04, F09, F10 are no longer in the pipeline.** Patient sign-in and
  patient self-service were scoped out, so F03 (sign-in) now feeds
  directly into F05 (directory) — there is no onboarding step between
  them.
- **F05 → F06 → F07** climbs the booking dependency tree:
  doctors/departments → schedules (with `departmentId`) → slots
  (filtered by `departmentId` and validated against
  `department_appointment_types`).
- **F08** lands the staff booking + lifecycle surface in one PR. STAFF
  is the primary booker; ADMIN can opt in by self-granting
  `appointment.create` via F11. There is no follow-up "patient
  booking" feature to split out.
- **DOCTOR is no longer "data-only"** — it carries `schedule.manage`
  (with app-layer own-doctor scope) and ships its UI surface in F06
  (own-schedule editor). DOCTOR users are created via the admin invite
  path in F11, which also creates the `Doctor` + `doctor_departments`
  rows transactionally — there are no seeded DOCTOR rows in F01.
- **F11** absorbs the role/permission management surface in addition to
  user invite/disable, because the policy CRUD endpoints share the same
  ADMIN guard and the same UI shell. ADMIN starts narrow (5 permissions)
  and tunes itself via `permission.assign` at runtime.
- **F11 and F12 are P1**: ship them if time allows; if not, document
  the gap in the README "deferred" section.
