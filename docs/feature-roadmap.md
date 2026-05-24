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
  join). Permissions are **code-defined** (canonical list in
  `apps/api/prisma/seed/permissions.ts`); the role→permission assignments
  are **runtime-mutable** by an ADMIN holding `permission.assign`.
- Seeded baseline: ADMIN→15 permissions, STAFF→11, DOCTOR→0 (data-only
  role; doctors authenticate but have no portal in P0).

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
| F01 | Database foundation                       | `feat/db-foundation`            | Add Docker Compose Postgres, Prisma schema (incl. RBAC tables `roles`/`permissions`/`policies`), first migration, seed, and a shared `PrismaService`. | E1 (data model)                                       | —             | `pnpm db:up && pnpm prisma migrate dev && pnpm db:seed` succeeds; Prisma Studio shows populated tables; `pnpm type-check && pnpm build` green.                                                                              | M      | P0       |
| F02 | Backend auth core                         | `feat/auth-backend`             | NestJS `auth/` module: JWT verify (jose), guards, error filter, `POST /auth/resolve`. Loads `user.role.policies` once per request and exposes the permission set on the request context for the `PermissionsGuard` / `@RequirePermission()` decorator. Resolves STAFF and ADMIN (DOCTOR also resolves but has zero permissions). | US-2.3, US-2.4, US-2.5, US-3.1                        | F01           | New auth e2e/unit specs pass; `/auth/resolve` covered by Swagger; protected stub endpoint returns `401` without cookie, `200` with valid JWT minted via test helper, `403 INSUFFICIENT_PERMISSION` when permission missing. | M      | P0       |
| F03 | Frontend NextAuth wiring + sign-in        | `feat/auth-frontend`            | Install NextAuth v5, Google provider, `/signin` page, role-aware home dispatcher, sign-out. No patient sign-in. | US-2.1, US-2.2, US-3.4                                | F02           | Manual: Google sign-in lands on `/[locale]`, role dispatcher routes ADMIN/STAFF to the clinic dashboard and DOCTOR to a "No portal in P0" page; sign-out clears cookie; `/signin?error=email_unverified` renders localized error. | M      | P0       |
| F05 | Doctors & departments directory           | `feat/directory`                | Read-only BE endpoints + minimal FE list/detail pages for departments and doctors.                  | US-4.1, US-4.2, US-4.3                                | F02, F03      | Manual: `/departments` and `/doctors` list seeded data; doctor detail page renders; STAFF and ADMIN can both view (gated on `doctor.list` / `doctor.read`); DOCTOR receives `403 INSUFFICIENT_PERMISSION`.                  | M      | P0       |
| F06 | Doctor schedule CRUD                      | `feat/schedules`                | BE `/doctors/:id/schedules` CRUD + UI for users with `schedule.manage` (STAFF + ADMIN by default).  | US-5.1, US-5.2, US-5.3, US-5.4                        | F05           | Manual: a STAFF user creates a schedule; overlap returns `409`; edit & delete work; a user without `schedule.manage` (e.g. DOCTOR) returns `403`.                                                                            | L      | P0       |
| F07 | Appointment types + slot finder           | `feat/slots`                    | BE-only: `/appointment-types` and `/doctors/:id/slots`. No UI. Gated on `appointment.create`.       | US-6.1, US-6.2                                        | F06           | Unit tests cover slot grid arithmetic and exclusion of past/booked slots; manual `curl` against seed data returns expected slots.                                                                                          | M      | P0       |
| F08 | Staff/admin booking + lifecycle           | `feat/staff-booking`            | BE `POST /patients` (walk-in), `GET /patients?q=`, `POST /appointments`, `GET /appointments`, `GET /appointments/:id`, `POST /appointments/:id/cancel` + booking & list UI. Permission-gated per endpoint; **no ownership filter** — every STAFF/ADMIN can act on every patient. | US-7.1, US-7.2, US-7.3, US-7.4, US-8.1, US-8.2, US-8.3 | F07           | Manual: STAFF books for any patient; conflicting double-book returns `409 SLOT_TAKEN`; cancel frees slot; ADMIN can do everything STAFF can.                                                                                | L      | P0       |
| F11 | Admin user + role/permission management   | `feat/admin-users`              | BE `/admin/users` (list, invite, disable, enable), `/admin/roles/:id/policies` (grant/revoke), optional `/admin/roles` (create custom role, P2) + minimal `(admin)/admin/users` & `(admin)/admin/roles` UI. **Single feature — no API/UI split.** | US-11.1, US-11.2, US-11.3, US-11.5 (+ US-11.6 P2)     | F03, F08      | Manual: ADMIN invites a new STAFF email; new staff signs in successfully; ADMIN disables them; subsequent sign-in returns `USER_DISABLED`; self-disable is blocked; ADMIN grants `appointment.cancel` to STAFF and observes the new permission on next request; ADMIN cannot revoke `permission.assign` from the ADMIN role. | L      | P1       |
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
- `apps/api/prisma/schema.prisma` — full P0 schema: enums
  (`AppointmentStatus`, `AppointmentType`, `DayOfWeek`, `Gender`,
  `BloodGroup`), RBAC models (`Role`, `Permission`, `Policy`), and the
  clinical models (`User`, `Patient`, `Department`, `Doctor`,
  `DoctorSchedule`, `Appointment`, `StaffDomain`).
  - The `Role` Prisma enum has been **removed**; `User.role_id` is an FK
    to the `roles` table.
  - `User.email` is `@unique` and **stored lowercased** (enforced via
    application-layer `normalizeEmail()` helper, since Prisma can't
    express a citext column natively without a migration extension).
  - `User.role_id` is NULLABLE only to permit the bootstrap insert of
    the super-admin (the chicken-and-egg between `roles.created_by` and
    `users.role_id`); every other user has a non-null `role_id` enforced
    at the API DTO layer.
  - Patients have **no `User` link** (`Patient.user_id` removed,
    `User.patient_id` removed) — patients do not sign in.
  - `Appointment.reason` is `String?` mapped to Postgres `@db.Text` — no
    length cap (per decision: no max).
- `apps/api/prisma/migrations/<timestamp>_init/migration.sql` — generated
  by `prisma migrate dev --name init`.
- `apps/api/prisma/seed/` — per-table seeders with an `index.ts`
  orchestrator. New RBAC seeders: `roles.ts` (3 rows: ADMIN, STAFF,
  DOCTOR), `permissions.ts` (15 code-defined rows), `policies.ts` (26
  rows: ADMIN→15, STAFF→11, DOCTOR→0). Plus the existing
  super-admin / users / departments / doctors / doctor-schedules /
  patients / appointments seeders. Totals: 10 users (1 super-admin + 2
  ADMIN + 2 STAFF + 5 DOCTOR — **no patient User rows**), 3
  departments, 5 doctors, 25 schedules, 10 patients, 10 appointments.
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

**Manual smoke test**

```bash
docker compose up -d postgres        # via pnpm db:up
pnpm --filter @his/api prisma migrate dev
pnpm --filter @his/api db:seed
pnpm --filter @his/api prisma studio  # verify rows in each table
```

---

### F02 — Backend auth core (P0, M)

**Why a standalone feature**

The auth contract (`POST /auth/resolve` + JWT verification + the
permission guard) is the single most reviewable security surface.
Isolating it from any frontend wiring lets the reviewer focus on
cryptographic correctness, role resolution, and the RBAC enforcement
layer.

**Files expected to change**

- `apps/api/src/auth/` — `auth.module.ts`, `auth.controller.ts`,
  `auth.service.ts`, `internal-secret.guard.ts`, `jwt.guard.ts`,
  `permissions.guard.ts`, `require-permission.decorator.ts`,
  `current-user.decorator.ts`, `swagger/` subfolder
  (`resolve.swagger.ts`, `index.ts`).
- `apps/api/src/auth/dto/resolve.dto.ts` — class-validator DTO for the
  Google profile payload.
- `apps/api/src/common/` — global `HttpExceptionFilter` producing the
  shared `{ statusCode, code, message, details? }` envelope; `errors.ts`
  enumerating stable `code` constants (incl. `NOT_INVITED`,
  `USER_DISABLED`, `INSUFFICIENT_PERMISSION`).
- `apps/api/src/app.module.ts` — register filter as APP_FILTER; register
  `JwtGuard` + `PermissionsGuard` as APP_GUARD so every endpoint is
  protected by default.
- `apps/api/src/users/` — minimal `UsersService` (find by email
  including `role.policies.permission` so the request handler has the
  permission set; link `googleSub`).
- `apps/api/test/auth.e2e-spec.ts` — happy path (STAFF resolves; ADMIN
  resolves; DOCTOR resolves with empty permission set), disabled user
  rejected, invalid JWT rejected, `INSUFFICIENT_PERMISSION` on a stub
  endpoint that requires `permission.assign`.
- `apps/api/package.json` — exact-pin add `jose@5.9.6`.

**Permission enforcement**

- The `JwtGuard` decodes the cookie and attaches `{ userId, roleCode }`
  to the request. The `PermissionsGuard` then loads
  `user.role.policies[].permission.code` via Prisma **once per request**
  (cached on the request context — Nest's request-scoped DI or a
  request-bound interceptor) and checks the codes declared by
  `@RequirePermission('appointment.create')` on the handler.
- Handlers with no `@RequirePermission()` only need a valid session
  (e.g. sign-out endpoint).
- Permission denials return `403` with `code=INSUFFICIENT_PERMISSION`
  and `details: { required: ['<code>'], held: ['<code>', ...] }`.

**Migration / breaking-change notes**

- No schema changes (F01 already covers `User.googleSub`,
  `User.disabledAt`, and the RBAC tables).

**Manual smoke test**

```bash
# Mint a test JWT (helper script in test/utils/sign-jwt.ts) for a seeded
# STAFF user and call:
curl -i -H "Cookie: next-auth.session-token=<jwt>" \
  http://localhost:3001/api/v1/me

# Resolve flow:
curl -i -X POST http://localhost:3001/api/v1/auth/resolve \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $INTERNAL_API_SECRET" \
  -d '{ "email": "staff1@example.com", "googleSub": "g-123",
        "emailVerified": true, "name": "Staff One", "picture": null }'
```

Expected: `200` with `{ userId, roleCode, permissionCodes }`. A
not-pre-created email returns `code=NOT_INVITED`. A request missing the
internal secret header returns `401 AUTH_INTERNAL_FORBIDDEN`. A
permission-gated stub endpoint returns `403 INSUFFICIENT_PERMISSION`
when the caller's role doesn't grant the required code.

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
  `/auth/resolve`).
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
3. Click "Continue with Google" → complete OAuth.
4. Land on `/en` (role dispatcher).
5. Click "Sign out" → back to `/en/signin`.
6. Visit `/en/signin?error=email_unverified` directly → localized error
   visible.

---

### F05 — Doctors & departments directory (P0, M)

**Why a standalone feature**

The directory is consumed by every booking flow. Landing it
read-only-first lets the reviewer validate listings without yet
worrying about mutation flows.

**Files expected to change**

- `apps/api/src/departments/` — module, controller, service, DTOs,
  `swagger/`. Endpoints declare `@RequirePermission('doctor.list')`.
- `apps/api/src/doctors/` — module, controller, service, DTOs,
  `swagger/`. List endpoint requires `doctor.list`; detail endpoint
  requires `doctor.read`.
- `apps/web/src/app/[locale]/(staff)/departments/page.tsx`,
  `(staff)/doctors/page.tsx`, `(staff)/doctors/[id]/page.tsx` — single
  staff/admin shell (no separate patient route group, patients don't
  sign in).
- `apps/web/src/lib/api/directory.ts` — typed fetch client using the
  `/api/be/*` rewrite.
- `apps/web/messages/*.json` — directory strings; regenerate
  `keys.generated.ts`.

**Migration / breaking-change notes**

- None — read-only against existing schema.

**Manual smoke test**

1. Sign in as a seeded STAFF user and ADMIN user in two browser
   profiles. Both see `/departments` and `/doctors` populated from
   F01 seed.
2. `/doctors?departmentId=<id>` filters.
3. `/doctors/<id>` renders detail.
4. Sign in as a seeded DOCTOR — the home dispatcher shows the "No
   portal in P0" page; calling `/api/be/doctors` directly with their
   cookie returns `403 INSUFFICIENT_PERMISSION`.

---

### F06 — Doctor schedule CRUD (P0, L)

**Why a standalone feature**

Schedules drive the slot finder. Implementing them in their own PR
isolates overlap-validation logic and the recurrence model from the
appointment domain.

**Files expected to change**

- `apps/api/src/schedules/` — module, controller, service, DTOs
  (`create-schedule.dto.ts`, `update-schedule.dto.ts`), `swagger/`.
  All endpoints declare `@RequirePermission('schedule.manage')`.
- `apps/api/src/schedules/schedule.validation.ts` — overlap detection
  helper covered by unit tests.
- `apps/web/src/app/[locale]/(staff)/doctors/[id]/schedule/page.tsx` —
  list grouped by weekday.
- `apps/web/src/app/[locale]/(staff)/doctors/[id]/schedule/_components/`
  — add/edit dialog, delete confirm dialog.
- `apps/web/src/lib/api/schedules.ts` — typed client.

**Migration / breaking-change notes**

- None — uses existing `DoctorSchedule` model.

**Manual smoke test**

1. As a STAFF or ADMIN user, open a doctor's schedule page.
2. Add a Monday 09:00–12:00 schedule effective today → appears in list.
3. Try to add an overlapping Monday 11:00–13:00 → `409 SCHEDULE_OVERLAP`.
4. Edit start time to 08:30 → succeeds.
5. Delete the schedule → row gone; the UI warns first if future
   appointments exist (seed should include one to exercise this).
6. As a DOCTOR (who lacks `schedule.manage`), the same `POST` returns
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

### F08 — Staff/admin booking + lifecycle (P0, L)

**Why a standalone feature**

The booking write path is the highest-risk surface (transactional
correctness, conditional `reason` for `PROCEDURE`, conflict detection).
Bundling list/detail/cancel keeps the staff/admin "lifecycle" surface in
one reviewable PR. If the diff grows too large, split into F08a (BE)
and F08b (FE).

**Files expected to change**

- `apps/api/src/appointments/` — module, controller, service, DTOs
  (`create-appointment.dto.ts`, `list-appointments.query.ts`,
  `cancel-appointment.dto.ts`), `swagger/` subfolder. Endpoints declare
  `@RequirePermission('appointment.create' | 'appointment.list' |
  'appointment.read' | 'appointment.cancel')` per route.
- `apps/api/src/appointments/appointments.service.ts` — transactional
  create with `Prisma.TransactionIsolationLevel.Serializable`, single
  retry on `40001`. `createdByUserId` is set from `session.userId`.
- `apps/api/src/patients/` — `POST /patients` (walk-in,
  `@RequirePermission('patient.create')`), `GET /patients?q=`
  (`@RequirePermission('patient.list')`). **No ownership filter** —
  every staff/admin caller sees every patient. No
  `primary_staff_user_id` is recorded on creation.
- `apps/api/test/appointments.e2e-spec.ts` — happy path, slot conflict
  (`409 SLOT_TAKEN`), conditional reason rule, cancel frees slot,
  permission denial for a caller missing the required code.
- `apps/web/src/app/[locale]/(staff)/appointments/page.tsx` — list with
  filters.
- `apps/web/src/app/[locale]/(staff)/appointments/[id]/page.tsx` —
  detail + cancel.
- `apps/web/src/app/[locale]/(staff)/appointments/new/page.tsx` —
  booking wizard (patient search → doctor → type → date → slot).
- `apps/web/src/lib/api/appointments.ts`,
  `apps/web/src/lib/api/patients.ts`.

**Migration / breaking-change notes**

- None.

**Manual smoke test**

1. As a STAFF user, open `/appointments/new`, search → results show any
   patient; pick one, pick a doctor + `CONSULTATION` + tomorrow + first
   slot, submit.
2. In a second tab repeat with the same slot → `409 SLOT_TAKEN` shown.
3. Open the new appointment detail → cancel → toast confirms.
4. Re-run step 2's request → `200` (slot freed).
5. Try `PROCEDURE` without `reason` → validation error.
6. Repeat step 1 as an ADMIN user — identical behavior.

---

### F11 — Admin user + role/permission management (P1, L)

**Why a standalone feature**

ADMIN-only surface, dedicated guard, env-driven domain allowlist, and
the runtime policy CRUD that lets admins re-shape STAFF's permissions
without a deploy. All three warrant a single review pass that exercises
the `permission.assign` flow end-to-end. UI is optional polish; the API
is the cuttable contract.

**Files expected to change**

- `apps/api/src/admin/` — module, controller, service, DTOs, `swagger/`.
- `apps/api/src/admin/admin.controller.ts` — user management:
  `POST /admin/users` (`@RequirePermission('user.invite')`),
  `GET /admin/users` (`user.list`),
  `POST /admin/users/:id/disable` (`user.disable`),
  `POST /admin/users/:id/enable` (`user.disable`); role + policy
  management: `POST /admin/roles/:id/policies` and
  `DELETE /admin/roles/:id/policies/:permissionId`
  (`@RequirePermission('permission.assign')`); optional
  `POST /admin/roles` (P2, also `permission.assign`).
- `apps/api/src/auth/` — extend resolver to reject `disabledAt != null`
  with `code=USER_DISABLED`; reject not-pre-created users with
  `code=NOT_INVITED`.
- `apps/api/src/admin/policy.service.ts` — lockout guard: rejects
  removing `permission.assign` from the ADMIN role with
  `code=CANNOT_REMOVE_LAST_PERMISSION_ASSIGN`.
- `apps/api/test/admin-users.e2e-spec.ts` — invite, disable,
  self-disable guard, domain rejection.
- `apps/api/test/admin-policies.e2e-spec.ts` — grant + revoke,
  duplicate-grant idempotency, lockout guard.
- `apps/web/src/app/[locale]/(staff)/admin/users/page.tsx` — list +
  invite + disable controls.
- `apps/web/src/app/[locale]/(staff)/admin/roles/page.tsx` — list roles,
  show permission grid, toggle grants (only visible to users with
  `permission.assign`).

**Migration / breaking-change notes**

- None (uses existing `User.disabledAt` and the RBAC tables seeded by
  F01).
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
   custom STAFF policy (if removed from baseline) or revokes it
   first then grants. After the grant, a newly-signed-in STAFF user can
   `POST /appointments/:id/cancel` successfully.
7. ADMIN revokes `appointment.cancel` from STAFF. The same STAFF user's
   next cancel attempt returns `403 INSUFFICIENT_PERMISSION`.
8. ADMIN attempts to revoke `permission.assign` from the ADMIN role →
   `409 CANNOT_REMOVE_LAST_PERMISSION_ASSIGN`.

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

- **F01 → F02 → F03** is non-negotiable: schema (incl. RBAC tables)
  before backend auth + permission guard, backend auth before frontend
  wiring.
- **F04, F09, F10 are no longer in the pipeline.** Patient sign-in and
  patient self-service were scoped out, so F03 (sign-in) now feeds
  directly into F05 (directory) — there is no onboarding step between
  them.
- **F05 → F06 → F07** climbs the booking dependency tree:
  doctors/departments → schedules → slots.
- **F08** lands the staff/admin booking + lifecycle surface in one PR;
  there is no follow-up "patient booking" feature to split out.
- **F11** absorbs the role/permission management surface in addition to
  user invite/disable, because the policy CRUD endpoints share the same
  ADMIN guard and the same UI shell.
- **F11 and F12 are P1**: ship them if time allows; if not, document
  the gap in the README "deferred" section.
