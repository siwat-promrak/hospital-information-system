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
| F01 | Database foundation                       | `feat/db-foundation`            | Add Docker Compose Postgres, Prisma schema, first migration, seed, and a shared `PrismaService`.    | E1 (data model)                                       | —             | `pnpm db:up && pnpm prisma migrate dev && pnpm db:seed` succeeds; Prisma Studio shows populated tables; `pnpm type-check && pnpm build` green.                                                                              | M      | P0       |
| F02 | Backend auth core                         | `feat/auth-backend`             | NestJS `auth/` module: JWT verify (jose), guards, error filter, `POST /auth/resolve`.               | US-2.3, US-2.4, US-2.5, US-3.1, US-3.2                | F01           | New auth e2e/unit specs pass; `/auth/resolve` covered by Swagger; protected stub endpoint returns `401` without cookie, `200` with valid JWT minted via test helper.                                                       | M      | P0       |
| F03 | Frontend NextAuth wiring + sign-in        | `feat/auth-frontend`            | Install NextAuth v5, Google provider, `/signin` page, role-aware home dispatcher, sign-out.         | US-2.1, US-2.2, US-3.4                                | F02           | Manual: Google sign-in lands on `/[locale]`, role dispatcher routes correctly; sign-out clears cookie; `/signin?error=email_unverified` renders localized error.                                                          | M      | P0       |
| F04 | Patient onboarding                        | `feat/onboarding`               | `/onboarding` form (FE) + `POST /me/patient` (BE) + onboarding guard.                               | US-3.3                                                | F03           | Manual: new patient signs in → redirected to `/onboarding`; submit creates `Patient`, links `User.patientId`; re-visiting `/onboarding` after link redirects home.                                                          | M      | P0       |
| F05 | Doctors & departments directory           | `feat/directory`                | Read-only BE endpoints + minimal FE list/detail pages for departments and doctors.                  | US-4.1, US-4.2, US-4.3                                | F02, F03      | Manual: `/departments` and `/doctors` list seeded data; doctor detail page renders; PATIENT and STAFF can both view.                                                                                                       | M      | P0       |
| F06 | Doctor schedule CRUD                      | `feat/schedules`                | BE `/doctors/:id/schedules` CRUD + staff UI under `(staff)`.                                        | US-5.1, US-5.2, US-5.3, US-5.4                        | F05           | Manual: staff creates a schedule; overlap returns `409`; edit & delete work; PATIENT call returns `403`.                                                                                                                    | L      | P0       |
| F07 | Appointment types + slot finder           | `feat/slots`                    | BE-only: `/appointment-types` and `/doctors/:id/slots`. No UI.                                      | US-6.1, US-6.2                                        | F06           | Unit tests cover slot grid arithmetic and exclusion of past/booked slots; manual `curl` against seed data returns expected slots.                                                                                          | M      | P0       |
| F08 | Staff booking + lifecycle                 | `feat/staff-booking`            | BE `POST /patients` (walk-in), `GET /patients?q=`, `POST /appointments`, `GET /appointments`, `GET /appointments/:id`, `POST /appointments/:id/cancel` + staff booking & list UI. Ownership filter applies. | US-7.1, US-7.2, US-7.3, US-7.4, US-8.1, US-8.2, US-8.3 | F07           | Manual: staff books for a patient THEY OWN; booking for a patient owned by another staff returns `403 PATIENT_NOT_OWNED` (verified with two-staff scenario); ADMIN bypasses; conflicting double-book returns `409 SLOT_TAKEN`; cancel frees slot. | L      | P0       |
| F09 | Patient view + cancel own                 | `feat/patient-appointments`     | BE `GET /me/appointments`, `POST /me/appointments/:id/cancel` + patient list UI.                    | US-9.1, US-9.2                                        | F08           | Manual: patient sees only own appointments; cancel works; attempting to access another patient's appointment returns `404`.                                                                                                | M      | P0       |
| F10 | Patient self-booking                      | `feat/patient-booking`          | BE `POST /me/appointments` + patient booking wizard UI.                                             | US-10.1, US-10.2                                      | F09           | Manual: patient completes the wizard, creates appointment under own `patientId`; body `patientId` overrides are ignored; `409` re-fetches slots.                                                                            | M      | P0       |
| F11 | Admin user management                     | `feat/admin-users`              | BE `/admin/users` (list, invite, disable, enable) + `PATCH /admin/patients/:id` (reassign primary staff) + minimal `(staff)/admin/users` UI. **Single feature — no API/UI split.** | US-11.1, US-11.2, US-11.3, US-11.4                    | F03, F08      | Manual: ADMIN invites a staff email; new staff signs in successfully; ADMIN disables them; subsequent sign-in returns `USER_DISABLED`; self-disable is blocked; ADMIN reassigns a self-service patient to a staff → that staff now sees them in `GET /patients?q=`. | L      | P1       |
| F12 | i18n parity + README                      | `chore/i18n-readme`             | Audit all strings to `messages/*.json`, regenerate keys, write project `README.md`.                 | US-12.1, US-12.2                                      | F11           | `pnpm type-check` green; manual lang switch shows no raw English on TH; README walkthrough takes a fresh clone to a running app in <15 min.                                                                                | M      | P1       |

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
- `apps/api/prisma/schema.prisma` — full P0 schema: enums (`Role`,
  `AppointmentStatus`), models (`User`, `Patient`, `Department`,
  `Doctor`, `DoctorSchedule`, `Appointment`, `StaffDomain`).
  - `User.email` is `@unique` and **stored lowercased** (enforced via
    application-layer `normalizeEmail()` helper, since Prisma can't
    express a citext column natively without a migration extension).
  - `Patient.primaryStaffUserId` is an optional FK to `User`
    (`onDelete: SetNull`). Used by §7 ownership filtering. Null for
    self-service patients pending an admin assignment.
  - `Patient.email` is `@unique`, also lowercased on write.
  - `Appointment.reason` is `String?` mapped to Postgres `@db.Text` — no
    length cap (per decision: no max).
- `apps/api/prisma/migrations/<timestamp>_init/migration.sql` — generated
  by `prisma migrate dev --name init`.
- `apps/api/prisma/seed.ts` — seeds 1 admin, 2 staff, 3 patients
  (with linked users; assign `primaryStaffUserId` for at least one
  staff-owned patient and leave at least one self-service patient with
  `primaryStaffUserId=null` to exercise both cases), 2 departments, 3
  doctors, several schedules, optional sample appointments.
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

The auth contract (`POST /auth/resolve` + JWT verification rules) is the
single most reviewable security surface. Isolating it from any
frontend wiring lets the reviewer focus on cryptographic and role
resolution correctness.

**Files expected to change**

- `apps/api/src/auth/` — `auth.module.ts`, `auth.controller.ts`,
  `auth.service.ts`, `internal-secret.guard.ts`, `jwt.guard.ts`,
  `current-user.decorator.ts`, `swagger/` subfolder (`resolve.swagger.ts`,
  `index.ts`).
- `apps/api/src/auth/dto/resolve.dto.ts` — class-validator DTO for the
  Google profile payload.
- `apps/api/src/common/` — global `HttpExceptionFilter` producing the
  shared `{ statusCode, code, message, details? }` envelope; `errors.ts`
  enumerating stable `code` constants.
- `apps/api/src/app.module.ts` — register filter as APP_FILTER.
- `apps/api/src/users/` — minimal `UsersService` (find by email, link
  googleSub) reused by auth.
- `apps/api/test/auth.e2e-spec.ts` — happy path (staff resolves),
  patient auto-create, disabled user rejected, invalid JWT rejected.
- `apps/api/package.json` — exact-pin add `jose@5.9.6`.

**Migration / breaking-change notes**

- No schema changes (F01 already covers `User.googleSub`,
  `User.disabledAt`).

**Manual smoke test**

```bash
# Mint a test JWT (helper script in test/utils/sign-jwt.ts) and call:
curl -i -H "Cookie: next-auth.session-token=<jwt>" \
  http://localhost:3001/api/v1/me

# Resolve flow:
curl -i -X POST http://localhost:3001/api/v1/auth/resolve \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $INTERNAL_API_SECRET" \
  -d '{ "email": "patient@example.com", "googleSub": "g-123",
        "emailVerified": true, "name": "Pat", "picture": null }'
```

Expected: `200` with `{ userId, role, patientId }`; subsequent calls
without the internal secret header return `401 AUTH_INTERNAL_FORBIDDEN`.

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
  (`email_unverified`, `user_disabled`, `internal`).
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

### F04 — Patient onboarding (P0, M)

**Why a standalone feature**

Onboarding is the first FE+BE pair where the backend mutates state on
behalf of a real session. Bundling them keeps the round-trip reviewable
in one diff, and the surface is small (one form, one endpoint).

**Files expected to change**

- `apps/api/src/me/` — `me.module.ts`, `me.controller.ts`,
  `me.service.ts`, `dto/create-patient.dto.ts`, `swagger/` (small).
- `apps/api/src/me/me.controller.ts` — `POST /me/patient` guarded by
  `JwtGuard`, role-restricted to `PATIENT`, errors if `User.patientId`
  is already set (`code=PATIENT_ALREADY_LINKED`).
- `apps/web/src/app/[locale]/(onboarding)/onboarding/page.tsx` — form
  with react-hook-form + zod, MUI inputs.
- `apps/web/src/lib/server/onboarding-guard.ts` — server util used by
  patient-area layouts to redirect to `/onboarding` when patient unlinked.
- `apps/web/messages/en.json`, `messages/th.json` — form labels and
  validation strings.
- `apps/web/package.json` — exact-pin add `react-hook-form@7.55.0`,
  `@hookform/resolvers@5.0.1`, `zod@3.24.1`, `date-fns@4.1.0`,
  `@mui/x-date-pickers@7.28.0`.

**Migration / breaking-change notes**

- None — uses existing `Patient` and `User` models.

**Manual smoke test**

1. Sign in with a fresh Google account NOT in the staff allowlist.
2. Verify automatic redirect to `/en/onboarding`.
3. Submit the form → redirect to `/en`.
4. Re-visit `/en/onboarding` → redirect home (already linked).

---

### F05 — Doctors & departments directory (P0, M)

**Why a standalone feature**

The directory is consumed by every booking flow. Landing it
read-only-first lets the reviewer validate listings without yet
worrying about mutation flows.

**Files expected to change**

- `apps/api/src/departments/` — module, controller, service, DTOs,
  `swagger/`.
- `apps/api/src/doctors/` — module, controller, service, DTOs,
  `swagger/`.
- `apps/web/src/app/[locale]/(staff)/departments/page.tsx`,
  `(staff)/doctors/page.tsx`, `(staff)/doctors/[id]/page.tsx`.
- `apps/web/src/app/[locale]/(patient)/doctors/page.tsx`,
  `(patient)/doctors/[id]/page.tsx` (or shared component reused across
  groups).
- `apps/web/src/lib/api/directory.ts` — typed fetch client using the
  `/api/be/*` rewrite.
- `apps/web/messages/*.json` — directory strings; regenerate
  `keys.generated.ts`.

**Migration / breaking-change notes**

- None — read-only against existing schema.

**Manual smoke test**

1. Sign in as a seeded patient and staff in two browser profiles.
2. Both can see `/departments` and `/doctors` populated from F01 seed.
3. `/doctors?departmentId=<id>` filters.
4. `/doctors/<id>` renders detail.

---

### F06 — Doctor schedule CRUD (P0, L)

**Why a standalone feature**

Schedules drive the slot finder. Implementing them in their own PR
isolates overlap-validation logic and the recurrence model from the
appointment domain.

**Files expected to change**

- `apps/api/src/schedules/` — module, controller, service, DTOs
  (`create-schedule.dto.ts`, `update-schedule.dto.ts`), `swagger/`.
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

1. As staff, open a doctor's schedule page.
2. Add a Monday 09:00–12:00 schedule effective today → appears in list.
3. Try to add an overlapping Monday 11:00–13:00 → `409 SCHEDULE_OVERLAP`.
4. Edit start time to 08:30 → succeeds.
5. Delete the schedule → row gone; the UI warns first if future
   appointments exist (seed should include one to exercise this).

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
correctness, conditional `reason` for `PROCEDURE`, conflict detection).
Bundling list/detail/cancel keeps the staff "lifecycle" surface in one
reviewable PR. If the diff grows too large, split into F08a (BE) and
F08b (FE).

**Files expected to change**

- `apps/api/src/appointments/` — module, controller, service, DTOs
  (`create-appointment.dto.ts`, `list-appointments.query.ts`,
  `cancel-appointment.dto.ts`), `swagger/` subfolder.
- `apps/api/src/appointments/appointments.service.ts` — transactional
  create with `Prisma.TransactionIsolationLevel.Serializable`, single
  retry on `40001`.
- `apps/api/src/patients/` — `POST /patients` (walk-in, auto-sets
  `primaryStaffUserId = session.userId`), `GET /patients?q=` filtered to
  owned patients for STAFF (ADMIN bypasses). Email normalized on write.
- `apps/api/test/appointments.e2e-spec.ts` — happy path, slot conflict
  (`409 SLOT_TAKEN`), conditional reason rule, cancel frees slot.
- `apps/web/src/app/[locale]/(staff)/appointments/page.tsx` — list with
  filters.
- `apps/web/src/app/[locale]/(staff)/appointments/[id]/page.tsx` —
  detail + cancel.
- `apps/web/src/app/[locale]/(staff)/appointments/new/page.tsx` — booking
  wizard (patient search → doctor → type → date → slot).
- `apps/web/src/lib/api/appointments.ts`,
  `apps/web/src/lib/api/patients.ts`.

**Migration / breaking-change notes**

- None.

**Manual smoke test**

1. As Staff A, open `/appointments/new`, search → results show only
   patients owned by Staff A; pick one, pick a doctor + `CONSULTATION` +
   tomorrow + first slot, submit.
2. In a second tab repeat with the same slot → `409 SLOT_TAKEN` shown.
3. Open the new appointment detail → cancel → toast confirms.
4. Re-run step 2's request → `200` (slot freed).
5. Try `PROCEDURE` without `reason` → validation error.
6. As Staff A, attempt `POST /appointments` with a `patientId` owned by
   Staff B → `403 PATIENT_NOT_OWNED`.
7. As ADMIN, repeat step 6 → succeeds (ADMIN bypasses).

---

### F09 — Patient view + cancel own (P0, M)

**Why a standalone feature**

Tight scope of "patient-scoped queries" exercises the session-derived
filter rule end-to-end, with zero net-new write logic beyond cancel.
Keeping it before F10 lets the reviewer validate read isolation before
the patient gets a write path.

**Files expected to change**

- `apps/api/src/me/me.controller.ts` — add
  `GET /me/appointments`, `POST /me/appointments/:id/cancel`.
- `apps/api/src/me/me.service.ts` — query/mutation helpers,
  cross-patient access guarded (404 not 403).
- `apps/api/test/me-appointments.e2e-spec.ts` — own/other isolation,
  cancel transitions.
- `apps/web/src/app/[locale]/(patient)/appointments/page.tsx` — upcoming
  + past split.
- `apps/web/src/app/[locale]/(patient)/appointments/[id]/page.tsx` —
  detail + cancel.
- `apps/web/src/lib/api/me.ts` — typed client.

**Migration / breaking-change notes**

- None.

**Manual smoke test**

1. Sign in as Patient A, view appointments seeded for them.
2. Cancel one upcoming → slot freed (verify via slot finder).
3. Sign in as Patient B, attempt to fetch Patient A's appointment ID
   directly via UI URL → `404`.

---

### F10 — Patient self-booking (P0, M)

**Why a standalone feature**

Reuses the same transactional booking core but exercises the session
override (server forces `patientId = session.patientId` regardless of
payload). Keeping it separate from F08 highlights that single rule in
the diff.

**Files expected to change**

- `apps/api/src/me/me.controller.ts` — add `POST /me/appointments`.
- `apps/api/src/me/me.service.ts` — delegate to the shared booking
  service, injecting session patient ID.
- `apps/web/src/app/[locale]/(patient)/book/page.tsx` — wizard
  (department → doctor → type → date → slot).
- `apps/web/src/app/[locale]/(patient)/book/_components/` — step
  components.
- `apps/web/src/lib/api/me.ts` — add `bookAppointment`.

**Migration / breaking-change notes**

- None.

**Manual smoke test**

1. As Patient A, complete the wizard → `/appointments/<id>` shows the
   new appointment.
2. Edit the network request in devtools to set `patientId` of Patient
   B → server-stored row still has Patient A.
3. Re-submit the same slot from another tab → `409`, UI re-fetches
   slots.

---

### F11 — Admin user management (P1, L)

**Why a standalone feature**

ADMIN-only surface, dedicated guard, and an env-driven domain
allowlist that warrants its own review. UI is optional polish; the API
is the cuttable contract.

**Files expected to change**

- `apps/api/src/admin/` — module, controller, service, DTOs, `swagger/`.
- `apps/api/src/admin/admin.controller.ts` — `POST /admin/users`,
  `GET /admin/users`, `POST /admin/users/:id/disable`,
  `POST /admin/users/:id/enable`, `PATCH /admin/patients/:id` (sets
  `primaryStaffUserId` per US-11.4; validates that the new owner has role
  STAFF/ADMIN and `disabledAt IS NULL`).
- `apps/api/src/auth/` — extend resolver to reject `disabledAt != null`
  with `code=USER_DISABLED`.
- `apps/api/test/admin-users.e2e-spec.ts` — invite, disable, self-disable
  guard, domain rejection.
- `apps/web/src/app/[locale]/(staff)/admin/users/page.tsx` — list +
  invite + disable controls (ADMIN only via session check).

**Migration / breaking-change notes**

- None (uses existing `User.disabledAt`).
- If this feature is cut to API-only, document so in PR description and
  link the deferred UI as a follow-up.

**Manual smoke test**

1. As ADMIN, invite `colleague@gmail.com` with role STAFF → row appears
   in the list.
2. Sign in as that account (Google) → succeeds, lands on staff home.
3. Back as ADMIN, disable that user.
4. The disabled user signs out and tries to sign in again → blocked
   with `USER_DISABLED` error on `/signin?error=user_disabled`.
5. ADMIN attempts to disable self → `400 CANNOT_DISABLE_SELF`.
6. ADMIN `PATCH /admin/patients/<self-service-patient-id>` setting
   `primaryStaffUserId` to a STAFF user → that STAFF now sees the
   patient in their `GET /patients?q=`; other STAFF do not.
7. ADMIN `PATCH` setting `primaryStaffUserId` to a disabled user →
   `400 INVALID_OWNER`.

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
   flows (signin, onboarding, doctors, booking, appointments list).

---

## 4. Sequencing rationale

- **F01 → F02 → F03** is non-negotiable: schema before backend auth,
  backend auth before frontend wiring.
- **F04 (onboarding) before F05 (directory)** so a fresh patient
  account has a clean path through the app the moment directory pages
  exist; otherwise the directory PR can't be smoke-tested as a patient.
- **F05 → F06 → F07** climbs the booking dependency tree:
  doctors/departments → schedules → slots.
- **F08 (staff) before F09 (patient view) before F10 (patient book)**
  lets the reviewer see write logic land first, then read isolation,
  then a write path that simply re-applies the session filter.
- **F11 and F12 are P1**: ship them if time allows; if not, document
  the gap in the README "deferred" section.
