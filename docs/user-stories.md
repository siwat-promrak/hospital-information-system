# Hospital Information System — User Stories

Appointment Booking module, P0 + P1 scope.

This document groups stories by epic (E1–E12). Each epic maps to one or more
features in `feature-roadmap.md`. Story IDs are stable: when a story is
implemented, reference its ID in commit messages and PR descriptions.

> **Out of scope per the spec interpretation locked in 2026-05-24:** patients
> do NOT sign in to this system. They are pure records managed by NURSE /
> ADMIN. The previously-considered patient self-service epics (view / cancel
> / book own appointments) have been removed entirely. The `Role` enum has
> also been removed; roles are now DB rows in the `roles` table with
> permissions granted via `policies`. **The original STAFF role was
> retired** — clinic operations are now split across NURSE
> (department-scoped front-desk), MEDICAL_RECORDS_OFFICER (cross-department
> records), PHARMACY (cross-department read-only), and DOCTOR (own-doctor
> writes + cross-coverage reads).

Roles used in this document (DB rows in the `roles` table — the `Role` enum
is gone):

- **PATIENT** — **out of scope.** Patients do NOT sign in to this system;
  they are pure records managed by NURSE / ADMIN / MEDICAL_RECORDS_OFFICER
  (no `User` link).
- **ADMIN** — **user / role / policy management only** (9 permissions:
  `user.*` 4 + `role.*` 4 + `doctor.read` 1). Clinic operations
  (`appointment.*`, `patient.*`, `schedule.*`, `medical_records.*`) are
  **NOT granted by default**; ADMIN can grant them to themselves or others
  at runtime via `role.update` (US-11.5).
- **DOCTOR** — first-class clinical role. Holds the full **own-doctor CRUD
  bundle** (15 permissions): five `schedule.*.own`, five
  `appointment.*.own`, `patient.read`, `doctor.read`,
  `medical_records.read.all`, `medical_records.create.own`,
  `medical_records.update.own`. Also holds `schedule.read.own-department`
  and `appointment.read.own-department` so doctors can see cross-coverage
  context within their own department. A `User` with `role.code = DOCTOR`
  always has a linked `Doctor` row (1:1) and a single home department
  sourced from `User.departmentId`. **Service-layer scope rule:** every
  `.own` permission narrows to `resource.doctorId === caller.doctor.id`;
  the schedule / appointment / medical-records services dispatch per
  HTTP verb against the widest scope held (per-verb resolvers in
  `apps/api/src/auth/scope.ts`).
- **NURSE** — department-scoped front-desk operator (14 permissions): four
  `schedule.*.own-department`, four `appointment.*.own-department`, full
  `patient.*` CRUD, `doctor.read`, `medical_records.read.all`. NURSE is
  the primary booker; every read / write narrows to the NURSE's own
  `User.departmentId`. Foreign-department mutates return
  `403 INSUFFICIENT_PERMISSION_SCOPE`.
- **MEDICAL_RECORDS_OFFICER (MRO)** — cross-department records role (9
  permissions): full `patient.*` CRUD, `appointment.read.all`,
  `schedule.read.all`, `doctor.read`, `medical_records.read.all`,
  `medical_records.update.all`. MRO can read every appointment / schedule
  / medical record and edit any patient or medical record. No booking, no
  schedule management.
- **PHARMACY** — cross-department pharmacy read-only role (3 permissions):
  `patient.read`, `doctor.read`, `medical_records.read.all`. Read-only
  access for medication preparation; no writes.

Conventions:

- "Slot" = a discrete bookable time window on a doctor's schedule, computed
  from `(DoctorSchedule, AppointmentType.durationMinutes)`.
- Slot grid step equals the chosen appointment type's duration (e.g. a 20-min
  consultation yields 09:00, 09:20, 09:40, …).
- All schedule times are stored as `startAt` / `endAt` (`timestamptz(3)` UTC) —
  concrete dated windows, not recurring weekday templates. Doctor schedules
  pivoted to this shape in F06; the per-row date + time fully encode the
  working window. See `docs/handoffs/F06-schedules-api.md` for the wire
  contract.
- `BOOKED` and `COMPLETED` block a slot; `CANCELLED` frees it for immediate
  reuse.
- `COMPLETED` transition is **deferred** in P0 (enum value exists, no
  endpoint/UI).
- **Email normalization** — every `email` column is stored as **lowercased**
  via a shared `normalizeEmail()` helper used on every write/upsert. All
  lookups compare against the normalized form. The Google profile email is
  lowercased before resolution.
- **`Appointment.reason`** is `text` (no length cap).
- **Audit columns** — every table (except `appointments`, which uses
  `status=CANCELLED` instead of soft-delete) carries the full cluster
  `created_at` / `created_by` / `updated_at` / `updated_by` / `deleted_at`
  / `deleted_by`. `created_by` is required; `updated_by` and `deleted_by`
  are nullable (a freshly-inserted row has no updater, and most rows are
  never soft-deleted). All `*_by` columns FK to `users.id` with `ON DELETE
  NO ACTION` so audit history survives user soft-deletes. `appointments`
  has `created_by` / `updated_by` only.
- **Authorization via RBAC** — every protected endpoint maps to one or more
  scope-aware permission codes
  (`<resource>.<create|read|update|delete>.<own|own-department|all>`). The
  Nest guard loads `user.role.policies[].permission.code` once per request
  via Prisma (cached on the request context) and checks the required
  permission against that set. The `Role` Prisma enum is gone: roles are
  now DB rows (`roles` table), permissions are code-defined (canonical
  list of **35** in `apps/api/src/auth/permissions.ts`), and admins attach
  permissions to roles at runtime via `role.update` (US-11.5). Seeded
  baseline: ADMIN→9, DOCTOR→15, NURSE→14, MEDICAL_RECORDS_OFFICER→9,
  PHARMACY→3 (50 policies total). Service-layer scope narrows per-verb
  via the resolvers in `apps/api/src/auth/scope.ts`; a caller holding a
  permission but at too narrow a scope gets
  `403 INSUFFICIENT_PERMISSION_SCOPE`.
- **`Patient.hn` format** — 7–9 digit numeric string (Postgres `VARCHAR(9)`
  with a CHECK constraint `^[0-9]{7,9}$` appended via raw SQL in the init
  migration; Prisma 5 cannot express CHECK natively). Seed format is
  `<YY><sequence>` (8 digits, e.g. `26000001`).
- **DB-level CHECK constraints** — 4 total, all appended as raw SQL to the
  init migration:
  1. `patients_hn_format` (HN regex);
  2. `doctor_schedules_window_valid` (start/end minute bounds);
  3. `doctor_schedules_break_valid` (break window if set lies inside
     working window);
  4. `appointments_end_after_start` (`end_at > start_at`).
  See the **Constraints reference** section near the end of this document.
- **`STAFF_ALLOWED_DOMAINS`** — env-driven email-domain allowlist for
  pre-created staff/admin invites. There is **no** `staff_domains` table;
  the allowlist lives entirely in environment configuration.
- **Session renewal model** — NO custom refresh-token table. The session
  is the NextAuth-issued HS256 JWT cookie; F03 configures
  `session.maxAge` (hard ceiling) + `session.updateAge` (sliding-window
  renewal interval) on the NextAuth instance. The BE never sees a
  refresh token because there is none — every authenticated request
  re-verifies the JWT signature and re-reads policies from the DB
  (see US-2.4 / US-3.1). The audit trail captures session lifecycle
  via `auth_logs` (US-2.6 / US-2.7).

---

## E1 — Database foundation

Purely infrastructural epic. No user-facing stories, but the data model is
documented here so all downstream stories are grounded.

### Data model (P0) — 12 tables

The first 11 tables ship with F01 (init migration; `doctor_departments`
was retired post-centralisation since Doctor↔Department is now 1:1 via
`User.departmentId`). `auth_logs` is added by F02 as a forward migration
(`add_auth_log`), and `medical_records` lands later as part of F08.

| Model                         | Purpose                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                       | Auth principal. Multilingual names (`firstNameEn`/`lastNameEn` required, `firstNameTh`/`lastNameTh` nullable). `email` is unique + lowercased; `googleSub?`; `roleId?` (nullable **only** to permit the bootstrap super-admin insert); soft-delete via `deletedAt` / `deletedBy`. **No patient link** — patients do not sign in. |
| `patients`                    | Pure record (no `User` link). Multilingual names (en required, th nullable); `hn @db.VarChar(9)` with CHECK `^[0-9]{7,9}$`; `identificationNo` (Thai national ID or passport, freeform); `email?` (unique, lowercased); phone; date of birth; gender; blood group (default `UNKNOWN`); emergency-contact triplet; address. |
| `departments`                 | Clinic department (`name` unique, `description?`). Soft-delete supported.                                                                                                                            |
| `department_appointment_types`| Per-department allowed `AppointmentType` set (the "department booking rules" from the spec). Unique on `(departmentId, appointmentType)`. Booking validation MUST check the pair exists here.        |
| `doctors`                     | Practitioner. 1-1 link to a `User` (`role.code = DOCTOR`). Carries `doctorCode` (unique), `medicalLicenseNo` (unique), `identificationNo` (required, freeform — parity with Patient). **No `departmentId` column** — the doctor's home department is sourced from `doctor.user.departmentId` (the linked User row). Doctor↔Department is **1:1** post the department centralisation. |
| `doctor_schedules`            | Dated availability window (NOT recurring) with `doctorId`, `departmentId` (denormalised from `doctor.user.departmentId` at write time so historical schedules survive a doctor moving departments — service layer rejects mismatches with `400 DOCTOR_DEPARTMENT_MISMATCH`), `startAt` / `endAt` (`timestamptz(3)` UTC, CHECK `end_at > start_at`), optional `breakStartAt` / `breakEndAt` (CHECK-validated), `acceptsBooking` flag. Each row is one specific UTC start/end pair; one-off shifts are first-class. Indexed on `(doctorId, departmentId)` and `(startAt)` for the calendar's date-range fetches. F06 pivoted from minute-based recurring templates to dated windows (the `_init` migration was regenerated). |
| `appointments`                | `patientId`, `doctorId`, `departmentId` (inherited from the chosen schedule), `scheduleId` (NOT NULL FK to `doctor_schedules.id` — F08 provenance link), `appointmentType`, `status`, `startAt` / `endAt` (CHECK `end > start`), `reason?` (Postgres `text`, no length cap), `createdBy` (renamed from `createdByUserId`), `updatedBy?`, `cancelledBy?` (renamed from `cancelledByUserId`) / `cancelledAt?` / `cancellationReason?`, `completedAt?`. Indexed on `(scheduleId, status)` so per-schedule lookups stay cheap. **No `deletedAt` / `deletedBy`** — uses `status=CANCELLED` instead. |
| `medical_records`             | Per-appointment clinical note authored by the assigned doctor. Carries `doctorId`, `patientId`, `departmentId` (denorm cache from the appointment), `appointmentId` (**UNIQUE** — exactly one record per appointment; duplicate inserts surface as `409 MEDICAL_RECORD_ALREADY_EXISTS` at the service layer), `note`, `drug?` (free-text for P0). Full audit cluster (`created_at/by`, `updated_at/by`). **Permanent — no soft-delete columns** (`deleted_at` / `deleted_by` are intentionally absent) and **no `medical_records.delete` permission** exists. |
| `roles`                       | RBAC role (`code` unique). Carries `is_deletable` (default `true`; all seeded rows pinned to `false`). Seeded with `ADMIN`, `DOCTOR`, `NURSE`, `MEDICAL_RECORDS_OFFICER`, `PHARMACY`; admins holding `role.create` may add custom roles at runtime. |
| `permissions`                 | Atomic capability with a stable `code` (`<resource>.<verb>.<scope>`). **Code-defined**: seeded from a canonical list in `apps/api/src/auth/permissions.ts`; adding a new permission requires a code change + seed re-run. **Catalog-only** — no audit columns (`created_by` / `updated_*` / `deleted_*` are absent) since the table never mutates at runtime. |
| `policies`                    | `(roleId, permissionId)` join — "role R has permission P". Unique on the pair. Carries `is_deletable` (default `true`; all seeded rows pinned to `false`). Granted / revoked at runtime by admins holding `role.update`. |
| `auth_logs`                   | **Append-only audit log** of auth events — `SIGN_IN_SUCCESS`, `SIGN_IN_FAILED`, `PERMISSION_DENIED`, `SIGN_OUT`. `userId` nullable so failed sign-ins for unknown emails still leave a forensic row; `email` is captured normalised on every event. Carries `requiredPermissions[]` / `heldPermissions[]` for `PERMISSION_DENIED` rows, plus optional `ip` / `userAgent` / `path` / `method`. **No audit cluster** — the table IS the audit trail (no `created_by`, no `deleted_*`); `createdAt` is the event timestamp. Added in F02 via the `add_auth_log` migration. |

There is **no `staff_domains` table** — the staff/admin email-domain
allowlist is env-driven via `STAFF_ALLOWED_DOMAINS`.

Enums (Prisma): `AppointmentStatus` (`BOOKED`, `CANCELLED`, `COMPLETED`),
`AppointmentType` (`NEW_PATIENT_VISIT`, `FOLLOW_UP`, `CONSULTATION`,
`PROCEDURE`), `DayOfWeek` (`SUN`…`SAT`), `Gender` (`MALE`, `FEMALE`),
`BloodGroup` (8 ABO/Rh combinations + `UNKNOWN`), `AuthLogEvent`
(`SIGN_IN_SUCCESS`, `SIGN_IN_FAILED`, `PERMISSION_DENIED`, `SIGN_OUT`).
The `Role` enum is GONE (roles are now a table). `AppointmentType` is a
Prisma enum on the `appointments` and `department_appointment_types`
tables; the per-type duration map (NEW_PATIENT_VISIT=30, FOLLOW_UP=15,
CONSULTATION=20, PROCEDURE=60) still lives in application code — no
separate table in P0. `AuthLogEvent` is added in F02 with `auth_logs`.

### Permission catalog (P0)

The **35** canonical permission codes seeded into `permissions`. Codes are
CRUD-verb-shaped: `<resource>.<create|read|update|delete>.<own|own-department|all>`.

| Family            | Codes                                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user.*` (4)      | `user.create`, `user.read`, `user.update`, `user.delete`                                                                                                                                                                                                                                               |
| `role.*` (4)      | `role.create`, `role.read`, `role.update`, `role.delete` (`role.update` also covers policy assignment)                                                                                                                                                                                                  |
| `appointment.*` (9) | `appointment.create.own`, `appointment.create.own-department`, `appointment.read.own`, `appointment.read.own-department`, `appointment.read.all`, `appointment.update.own`, `appointment.update.own-department`, `appointment.delete.own`, `appointment.delete.own-department`                          |
| `schedule.*` (9)  | `schedule.create.own`, `schedule.create.own-department`, `schedule.read.own`, `schedule.read.own-department`, `schedule.read.all`, `schedule.update.own`, `schedule.update.own-department`, `schedule.delete.own`, `schedule.delete.own-department`                                                     |
| `patient.*` (4)   | `patient.create`, `patient.read`, `patient.update`, `patient.delete` (scope-less — full access for anyone holding the perm)                                                                                                                                                                            |
| `doctor.*` (1)    | `doctor.read` (catalog lookups are global)                                                                                                                                                                                                                                                             |
| `medical_records.*` (4) | `medical_records.read.all`, `medical_records.create.own`, `medical_records.update.own`, `medical_records.update.all` — **no delete permission**: medical records are permanent (no soft-delete column either)                                                                                  |

Default policy grants — **50 rows total** (9 + 15 + 14 + 9 + 3):

- **ADMIN** → **9** permissions (user + role management): `user.create`,
  `user.read`, `user.update`, `user.delete`, `role.create`, `role.read`,
  `role.update`, `role.delete`, `doctor.read`. Clinic operations are NOT
  granted by default; ADMIN can grant them at runtime via `role.update`.
- **DOCTOR** → **15** permissions: `schedule.read.own`,
  `schedule.read.own-department`, `schedule.create.own`,
  `schedule.update.own`, `schedule.delete.own`, `appointment.read.own`,
  `appointment.read.own-department`, `appointment.create.own`,
  `appointment.update.own`, `appointment.delete.own`, `patient.read`,
  `doctor.read`, `medical_records.read.all`, `medical_records.create.own`,
  `medical_records.update.own`. The schedule / appointment / medical
  records services narrow by `caller.doctor.id`.
- **NURSE** → **14** permissions (department-scoped front-desk):
  `schedule.create.own-department`, `schedule.read.own-department`,
  `schedule.update.own-department`, `schedule.delete.own-department`,
  `appointment.create.own-department`, `appointment.read.own-department`,
  `appointment.update.own-department`, `appointment.delete.own-department`,
  `patient.create`, `patient.read`, `patient.update`, `patient.delete`,
  `doctor.read`, `medical_records.read.all`.
- **MEDICAL_RECORDS_OFFICER** → **9** permissions (cross-department
  records): `patient.create`, `patient.read`, `patient.update`,
  `patient.delete`, `appointment.read.all`, `schedule.read.all`,
  `doctor.read`, `medical_records.read.all`, `medical_records.update.all`.
- **PHARMACY** → **3** permissions (cross-department read-only):
  `patient.read`, `doctor.read`, `medical_records.read.all`.

The `roles` and `policies` tables carry an `is_deletable` column (default
`true`); every seeded baseline row is pinned to `false` so a future F11
admin UI cannot delete them. The invariant lives in F11's service layer.

### Constraints enforced at DB level

Four raw-SQL CHECK constraints are appended to the init migration (Prisma
5 cannot express CHECK natively). See the **Constraints reference** at the
end of this document for SQL.

1. `patients_hn_format` — `hn ~ '^[0-9]{7,9}$'`.
2. `doctor_schedules_end_after_start` — `end_at > start_at` (F06 pivot;
   replaces the original `doctor_schedules_window_valid` minute bounds).
3. `doctor_schedules_break_valid` — if either break timestamp is set,
   both must be set, the break window must lie inside the working
   window, and `break_start_at < break_end_at`.
4. `appointments_end_after_start` — `end_at > start_at`.

Past-`startAt` rejection on `DoctorSchedule` writes is **not** a DB CHECK
(Postgres cannot express `now` in a constraint) — it lives in the
service-layer guard and surfaces as `400 SCHEDULE_START_IN_PAST`.

### Notes / assumptions

- Role + Permission + Policy are seeded by `apps/api/prisma/seed/{roles,permissions,policies}.ts`. The full permission catalog is canonical — adding a new permission requires a code change + migration.
- The super-admin user is bootstrapped at the nil UUID (`00000000-0000-0000-0000-000000000000`) with `role_id = NULL` so the chicken-and-egg `roles.created_by` / `users.role_id` cycle can resolve (Option C bootstrap). Its `role_id` is back-filled to ADMIN immediately after roles are seeded.
- `User.role_id` is nullable **only** to permit the bootstrap insert; every non-bootstrap user MUST have a non-null `role_id` (enforced at the API DTO layer).
- Soft-delete is supported on every table (full audit cluster `deletedAt` / `deletedBy`) **except** `appointments`, which uses the `status=CANCELLED` transition instead.
- All timestamps stored as `timestamptz(3)` (UTC), rendered clinic-local in UI.
- Doctor↔Department is **1:1**. The doctor's home department is the
  **single source of truth on `User.departmentId`** (post the department
  centralisation — `Doctor` no longer carries its own `department_id`
  column). Every read goes through `doctor.user.departmentId`. Each
  `DoctorSchedule` denormalises the doctor's current department onto the
  row at write time (validated to match `doctor.user.departmentId` and
  surfaced as `400 DOCTOR_DEPARTMENT_MISMATCH` on drift), so historical
  schedules remain attributed to the department where they were performed
  even if the doctor later moves. The booking flow inherits
  `Appointment.departmentId` from the chosen schedule (not from the doctor).

### Seeded data (development)

The dev seed orchestrator (`apps/api/prisma/seed/index.ts`) produces a
stable, idempotent baseline. **No appointments are seeded** — those are
created via application workflows (booking) in later features. F06
expanded the original baseline (which had no DOCTOR users or schedules)
with 75 doctors + 2700 dated schedules so directory pagination, the
doctor picker, and the calendar all have a realistic dataset to stress.

- **5 roles** — `ADMIN`, `DOCTOR`, `NURSE`, `MEDICAL_RECORDS_OFFICER`,
  `PHARMACY`.
- **35 permissions** — the canonical catalog above (scope-aware codes).
- **50 policies** — 9 + 15 + 14 + 9 + 3 as listed above.
- **81 users** — 1 super-admin (nil UUID) + 2 ADMIN
  (`admin1@gmail.com`, `admin2@gmail.com`) + 1 NURSE
  (`nurse1@gmail.com`, anchored in the first seeded department) +
  1 MEDICAL_RECORDS_OFFICER (`records1@gmail.com`) +
  1 PHARMACY (`pharmacy1@gmail.com`) + **75 DOCTOR**
  (`doctor01@gmail.com`…`doctor75@gmail.com`).
- **10 departments** — Cardiology, Internal Medicine, Pediatrics,
  Orthopedics, Obstetrics & Gynecology, Dermatology, Ophthalmology,
  Otolaryngology (ENT), General Surgery, Emergency Medicine.
- **~34 `department_appointment_types`** — per-department allowed-type
  matrix.
- **10 patients** — HN `26000001`…`26000010`, emails
  `patient1@mailsac.com`…`patient10@mailsac.com`, multilingual names mix
  (about half have Thai names), 5 MALE + 5 FEMALE, blood-group mix
  including `UNKNOWN`.
- **75 doctors** — 15 hand-crafted + 60 generated, spread across all 10
  departments. Each doctor is assigned a single home department via the
  linked `User.departmentId` (Doctor↔Department is 1:1 post the
  centralisation).
- **2700 doctor_schedules** — 75 doctors × 3 weekdays × 12 weeks (past 8
  + next 4) of dated windows. Each schedule's `department_id` denormalises
  the doctor's current `User.departmentId` at seed time.

---

## E2 — Authentication & session

### US-2.1 — Google sign-in

**US-2.1** — As any user, I want to sign in with my Google account, so that
I can access the system without managing another password.

**Acceptance criteria:**

- `/signin` page shows a single "Continue with Google" button.
- Clicking the button initiates Google OAuth via NextAuth v5.
- On successful Google callback, an httpOnly session cookie is set
  containing an HS256-signed JWT keyed by `NEXTAUTH_SECRET`.
- JWT payload includes at minimum: `sub` (Google sub), `email`,
  `email_verified`, `name`, `picture`.
- The session cookie is `SameSite=Lax`, `Secure` in production, `Path=/`.
- After sign-in, the user is redirected to `/[locale]` (role dispatcher).

**Notes / assumptions:** Only Google provider is supported. No
password/magic-link fallback.

### US-2.2 — Sign-out

**US-2.2** — As a signed-in user, I want to sign out, so that my session
ends on this device.

**Acceptance criteria:**

- A "Sign out" action is reachable from the app header for any signed-in
  user.
- Triggering sign-out calls `POST /auth/signout` (which writes a
  `SIGN_OUT` row to `auth_logs` — see US-2.7) and then clears the session
  cookie via NextAuth's `signOut()` and redirects to `/signin`.
- After sign-out, accessing a protected route redirects back to `/signin`.

**Notes / assumptions:** Cookie clearing is the FE's responsibility — the
BE endpoint exists purely for the audit trail. A network failure on the
`POST /auth/signout` call MAY still clear the cookie locally; the user
experience prefers a successful local sign-out over a guaranteed audit
row.

### US-2.3 — Unverified Google email is rejected

**US-2.3** — As the system, I want to reject Google accounts whose email is
not verified, so that I can trust the email claim for role resolution.

**Acceptance criteria:**

- If Google returns `email_verified=false`, sign-in fails.
- The user is redirected to `/signin?error=email_unverified` with a
  localized message.
- No `User` row is created.

### US-2.4 — Backend rejects invalid / expired tokens

**US-2.4** — As the backend, I want to reject requests bearing a missing,
invalid, or expired session token, so that protected endpoints stay safe.

**Acceptance criteria:**

- Requests without a session cookie to a protected endpoint return `401`.
- Requests with a tampered JWT signature return `401`.
- Requests with an expired JWT (`exp` past) return `401`.
- All `401` responses use the shared error envelope (see E2.5).

### US-2.5 — Consistent error envelope

**US-2.5** — As a frontend developer, I want all backend errors in a single
shape, so that I can render and log them uniformly.

**Acceptance criteria:**

- All `4xx`/`5xx` responses from the backend return
  `{ statusCode, code, message, details? }`.
- A global Nest exception filter maps known errors (validation, auth, not
  found, conflict) to stable `code` strings (e.g. `AUTH_INVALID_TOKEN`,
  `VALIDATION_FAILED`).

### US-2.6 — Append-only auth log

**US-2.6** — As an operator, I want every sign-in attempt and permission
denial recorded in an append-only audit log, so that I can investigate
access patterns and forensic events without trusting application logs.

**Acceptance criteria:**

- `auth_logs` is append-only: no `UPDATE`s and no soft-delete cluster —
  the table IS the audit trail. `createdAt` (timestamptz) doubles as the
  event timestamp.
- Four event types are captured:
  - `SIGN_IN_SUCCESS` — successful `POST /auth/resolve`. Row carries
    `{ userId, email, ip?, userAgent?, path, method }`.
  - `SIGN_IN_FAILED` — `POST /auth/resolve` rejected for any reason.
    `userId` is **null** (the unknown-email case still leaves a forensic
    row), `email` is the raw input (lowercased), `reason` is the stable
    error code (`EMAIL_UNVERIFIED`, `NOT_INVITED`, `USER_DISABLED`).
  - `PERMISSION_DENIED` — `403 INSUFFICIENT_PERMISSION` from
    `PermissionsGuard`. `requiredPermissions[]` and `heldPermissions[]`
    mirror the response `details`; `userId` may be null when the JWT
    decoded but no user row exists (defensive).
  - `SIGN_OUT` — see US-2.7.
- Optional forensic columns (`ip`, `userAgent`, `path`, `method`) are
  captured from the Express request. `ip` reads `X-Forwarded-For`
  (left-most entry) before falling back to `request.ip`. Oversized
  values are truncated to column limits (path 512, method 16, ip 45,
  userAgent 512) — log writes never fail due to oversized inputs.
- The BE **awaits** the log write before the response is sent so the
  audit row is guaranteed before the caller sees the outcome. The
  underlying `INSERT` is wrapped in `try/catch` inside `AuthLogService`;
  a DB failure is logged at `ERROR` level and swallowed so the auth
  response is never broken by an audit failure.
- The FK from `auth_logs.userId` to `users.id` uses `ON DELETE NO
  ACTION` so logs survive a user soft-delete (audit-trail durability).
- Indexed on `(userId, createdAt)`, `(event, createdAt)`, and `email`
  to support common forensic queries ("last 5 sign-ins for user X",
  "all PERMISSION_DENIED in the last hour", "all events for an email").

**Notes / assumptions:** Admin-side endpoints for *reading* `auth_logs`
are NOT in P0 — the table is an inserter-only surface in F02. A future
admin feature MAY expose a read API under `/admin/auth-logs` gated on a
new permission code; until then, operators query Postgres directly.

### US-2.7 — Backend sign-out endpoint

**US-2.7** — As any signed-in user, I want the BE to record my sign-out
event, so that the audit trail captures voluntary session termination
alongside sign-in events.

**Acceptance criteria:**

- `POST /auth/signout` requires a valid session (any role); no
  `@RequirePermission()` — every authenticated user may sign themselves
  out.
- Writes a `SIGN_OUT` row to `auth_logs` with the calling user's id +
  email + request context, then returns `204 No Content`.
- The endpoint does NOT clear any cookie — cookie clearing is the FE's
  responsibility via NextAuth's `signOut()` helper (US-2.2 covers the UX).

---

## E3 — Role resolution & onboarding

Patient sign-in has been removed from scope (see top callout). The
onboarding epic is now reduced to staff/admin resolution + the home
dispatcher; the previous US-3.2 (patient auto-creation) and US-3.3
(patient onboarding form) are gone.

### US-3.1 — Role resolution on first sign-in

**US-3.1** — As any pre-created user (ADMIN / DOCTOR / NURSE /
MEDICAL_RECORDS_OFFICER / PHARMACY), I want my Google sign-in to resolve
to my existing `User` record, so that I land in the right workspace
immediately.

**Acceptance criteria:**

- NextAuth `signIn` callback calls backend `POST /auth/resolve` with the
  Google profile (email, sub, name, picture), guarded by the
  `INTERNAL_API_SECRET` header.
- Backend **lowercases** the incoming email via `normalizeEmail()` before
  any lookup.
- Backend matches an existing `User` by the normalized `email` whose
  `role.code IN SIGN_IN_ELIGIBLE_ROLES` (`ADMIN`, `DOCTOR`, `NURSE`,
  `MEDICAL_RECORDS_OFFICER`, `PHARMACY`) and whose `deletedAt IS NULL`.
- The domain allowlist (`STAFF_ALLOWED_DOMAINS` — name retained for
  backward compatibility) governs which email domains may sign in at
  all; emails outside the allowlist that don't match any pre-created
  `User` are rejected with `code=NOT_INVITED` (there is no patient
  fallback).
- On match, backend sets `googleSub` if previously null and returns
  `{ userId, roleCode, permissionCodes[] }` (the permission list is loaded
  from `user.role.policies[].permission.code`).
- Resolved role and permissions are encoded in the JWT and used by the
  home dispatcher and per-request permission guard.

**Notes / assumptions:** All five sign-in-eligible roles are created via
E11 (`user.create`); this story assumes the `User` row already exists.
DOCTOR users are created alongside their `Doctor` clinical record via
the admin invite flow — the take-home does not seed any DOCTOR rows.

### US-3.4 — Home dispatcher routes by role

**US-3.4** — As a signed-in user, I want the root path to take me to the
right workspace, so that I don't have to remember role-specific URLs.

**Acceptance criteria:**

- `GET /[locale]` reads the session role code:
  - `ADMIN` → renders the admin dashboard (user / role / policy
    management).
  - `NURSE` → renders the clinic dashboard
    (appointments / patients / schedules) scoped to the nurse's own
    department.
  - `DOCTOR` → renders the unified `/schedules` page (permission-adaptive
    view of own + own-department schedules).
  - `MEDICAL_RECORDS_OFFICER` → renders the medical-records landing page
    with cross-department patient + records access.
  - `PHARMACY` → renders the pharmacy landing page (read-only patients +
    records).
  - Unauthenticated → server-side redirect to `/signin`.
- There is no PATIENT branch — patients cannot authenticate.

---

## E4 — Doctor & Department directory ✅ shipped (F05, `feat/directory`)

> **Delta from the original AC, captured during F05 implementation:**
> Every list endpoint now returns the shared `Paginated<T>` envelope
> rather than a flat array — accepts `?page=&pageSize=` (default 1/20,
> max 500, or the `all` sentinel for date-windowed fetches). See
> CLAUDE.md §8 for the contract. The doctor detail endpoint's 404
> envelope uses the generic `NOT_FOUND` code (rather than the originally
> drafted `DOCTOR_NOT_FOUND`) — code catalog only defines `NOT_FOUND`
> today.

### US-4.1 — List departments

**US-4.1** — As any signed-in clinical user (NURSE / DOCTOR / MRO /
PHARMACY / ADMIN), I want to see all departments, so that I can filter
doctors by specialty.

**Acceptance criteria:**

- `GET /departments?page=&pageSize=` returns
  `{ data: [{ id, name, description? }], total, page, pageSize, totalPages }`
  ordered by `name`.
- Endpoint requires the `doctor.read` permission, which every seeded
  role except PATIENT (out of scope) holds.
- Department list page renders the result with localized labels and a
  `<PaginationControl>` at the bottom (hidden when `totalPages <= 1`).

### US-4.2 — List doctors (optionally filtered by department)

**US-4.2** — As a NURSE / DOCTOR / MRO / PHARMACY user, I want to browse
doctors, so that I can pick one to book with or look up a colleague.

**Acceptance criteria:**

- `GET /doctors?departmentId=:id?&page=&pageSize=` returns
  `{ data: [{ id, firstNameEn, lastNameEn, doctorCode, gender?, department: { id, name } }], total, page, pageSize, totalPages }`.
  Each doctor has a single home department sourced from
  `doctor.user.departmentId` (Doctor↔Department is 1:1).
- Without `departmentId`, returns every active doctor ordered by
  `doctorCode asc`. With `departmentId`, returns doctors whose home
  department matches it.
- Endpoint requires the `doctor.read` permission.
- A `/doctors` page shows the list with a department filter dropdown +
  pagination control. Changing the filter resets `page=1` so the user
  doesn't land on an empty page beyond the filtered result set; the
  filter value is preserved as `?departmentId=` across page navigation.
- "Doctors in a department" is served by `GET /doctors?departmentId=:id`
  — the previous companion `GET /departments/:id/doctors` was retired so
  there is one canonical lookup for this view.

### US-4.3 — View doctor detail

**US-4.3** — As a NURSE / DOCTOR / MRO / PHARMACY user, I want to view a
doctor's profile, so that I can see their home department and upcoming
availability summary.

**Acceptance criteria:**

- `GET /doctors/:id` returns the doctor record (incl. `doctorCode`,
  `medicalLicenseNo`, `gender?`, `phone`, `address?`), the home
  department (sourced from `doctor.user.departmentId`), and a thin
  schedule count (`scheduleCount`) — the full schedule grid lands in F06.
- Endpoint requires the `doctor.read` permission.
- `404` with `code=NOT_FOUND` if the doctor does not exist or has been
  soft-deleted.
- A `/doctors/:id` page renders the detail. A "Book appointment" CTA
  (gated on the caller also holding `appointment.create.*`) is deferred
  to F09 when the booking flow lands.

---

## E5 — Doctor Schedule management ✅ shipped (F06, `feat/schedules`)

> **Delta from the original AC, captured during F06 implementation:**
> The schedule model pivoted mid-feature from **recurring weekly
> templates** (`dayOfWeek + startMinute + endMinute + effectiveFrom +
> effectiveUntil`) to **concrete dated windows** (`startAt + endAt +
> breakStartAt? + breakEndAt?`, all `timestamptz(3)` UTC). The `_init`
> migration was regenerated to land the new column shape. Endpoints
> moved to the flat `/schedules` namespace (no `/doctors/:id/schedules`
> nesting). DOCTOR scope behaviour was tightened so foreign GET returns
> `404 SCHEDULE_NOT_FOUND` (no existence leak) while foreign mutate
> returns `403 INSUFFICIENT_PERMISSION_SCOPE`. A service-layer
> past-`startAt` guard (`400 SCHEDULE_START_IN_PAST`) was added because
> the DB cannot express `now` in a CHECK. Full wire contract in
> `docs/handoffs/F06-schedules-api.md`.

All endpoints in this epic are gated by the **scope-aware**
`schedule.<verb>.<scope>` permission family. Each HTTP verb checks for at
least one of its scope variants; the service then narrows by the widest
held. Seeded baseline:
- **DOCTOR** holds `schedule.{read,create,update,delete}.own` plus
  `schedule.read.own-department` — full CRUD on own schedules, read-only
  cross-coverage within their own department.
- **NURSE** holds `schedule.{create,read,update,delete}.own-department`
  — every CRUD verb scoped to the nurse's own `User.departmentId`.
- **MRO** holds `schedule.read.all` — global read, no writes.
- **ADMIN / PHARMACY** hold no `schedule.*` codes by default.

**Per-verb scope dispatch:** the service uses `resolveSchedule<Verb>Scope(user)`
to compute the widest scope held for the verb at hand. A DOCTOR holding
`.read.own-department` no longer accidentally widens their WRITE scope —
each verb is dispatched independently. Foreign-doctor / foreign-department
mutates return `403 INSUFFICIENT_PERMISSION_SCOPE`; foreign GET of a
specific id returns `404 SCHEDULE_NOT_FOUND` so probing cannot leak
existence.

**Department coupling:** each `DoctorSchedule` row carries a required
`departmentId`, denormalised from the doctor's current
`User.departmentId` at write time. The service rejects a request whose
`departmentId` doesn't match `doctor.user.departmentId` with
`400 DOCTOR_DEPARTMENT_MISMATCH`.

**DB-level CHECK constraints back-stop the validation:**
`doctor_schedules_end_after_start` enforces `endAt > startAt` and
`doctor_schedules_break_valid` enforces the break-window invariants (see
the Constraints reference). DTOs mirror these checks for fast user
feedback. The past-`startAt` rejection is service-layer only
(`400 SCHEDULE_START_IN_PAST`).

### US-5.1 — Lists schedules in a date range ✅ shipped

**US-5.1** — As a user holding any `schedule.read.*` permission, I want to
view schedule rows inside a date range (and optionally filtered by doctor
/ department), so that I can see and manage availability across the
focused window.

**Acceptance criteria:**

- `GET /schedules?page=&pageSize=&doctorId=&departmentId=&from=&to=`
  returns the shared `Paginated<ScheduleResponse>` envelope. Each row:
  `{ id, doctorId, doctor: { id, doctorCode, firstNameEn, lastNameEn, firstNameTh?, lastNameTh? }, departmentId, department: { id, name, description? }, startAt, endAt, breakStartAt?, breakEndAt?, acceptsBooking, createdAt, updatedAt }`.
  Sort: `startAt ASC` (closest upcoming window first).
- `from` / `to` are calendar dates (`YYYY-MM-DD`). The service expands
  them to `[startOfDay(from), endOfDay(to)]` UTC and matches schedules
  whose `[startAt, endAt)` intersects the range. When BOTH are omitted,
  the range defaults to the current calendar month UTC.
- `pageSize=all` (sentinel) is permitted — the calendar uses it bounded
  by `from` / `to` so a populated month / week fits in one response.
- Endpoint requires any `schedule.read.{own|own-department|all}`.
  The service narrows by the widest scope held:
  - `.all` → no narrowing (MRO).
  - `.own-department` → `departmentId === caller.user.departmentId`.
  - `.own` → `doctorId === caller.doctor.id`.
  A request explicitly setting `?doctorId=` or `?departmentId=` to a
  value outside the caller's allowed scope returns
  `403 INSUFFICIENT_PERMISSION_SCOPE`.
- The FE `/schedules` page is **permission-adaptive** with four view
  modes resolved at render time from the caller's effective scope:
  - **mode A — `all`** (MRO `schedule.read.all`): every doctor.
  - **mode B — `own+dept`** (DOCTOR `read.own` + `read.own-department`):
    defaults to own; can widen to department via a Switch toggle.
  - **mode C — `dept`** (NURSE `read.own-department`): auto-narrowed to
    own department; doctor filter narrows to the department's doctors.
  - **mode D — `own`** (DOCTOR with only `read.own`): own-doctor only.
- The UI renders a calendar with toggleable month / week views.
  `?view=month|week`, `?month=YYYY-MM`, `?weekStart=YYYY-MM-DD`, and
  `?departmentId=` are URL state. Schedules render as colored chips
  (month) or positioned blocks with lane assignment for overlaps (week).
  Clicking an empty day cell (month view) or an empty area in a column
  (week view) opens the day-details dialog listing every schedule on that
  date.

### US-5.2 — Creates a schedule ✅ shipped

**US-5.2** — As a user holding `schedule.create.own` (DOCTOR) or
`schedule.create.own-department` (NURSE), I want to add a new dated
availability window for a doctor, so that the slot finder can offer their
availability for booking on that date.

**Acceptance criteria:**

- `POST /schedules` accepts
  `{ doctorId, departmentId, startAt, endAt, breakStartAt?, breakEndAt?, acceptsBooking? }`.
  All datetimes are ISO 8601 UTC strings.
- Cross-field validation (DTO, rejected `400 VALIDATION_FAILED` before
  any DB work): `endAt > startAt`; if either `breakStartAt` or
  `breakEndAt` is set, BOTH must be set; `breakStartAt < breakEndAt`;
  `breakStartAt >= startAt` AND `breakEndAt <= endAt`. These mirror the
  DB CHECK constraints.
- `startAt` MUST be strictly in the future (`startAt > now`). Past values
  are rejected `400 SCHEDULE_START_IN_PAST` at the service layer (DB
  cannot express `now` in a CHECK).
- `departmentId` MUST match the doctor's current
  `doctor.user.departmentId`; otherwise reject with
  `400 DOCTOR_DEPARTMENT_MISMATCH`.
- Backend rejects schedules whose `[startAt, endAt)` intersects another
  active schedule for the same `doctorId` (half-open overlap; back-to-back
  windows do NOT overlap) with `409 SCHEDULE_OVERLAP` and `details:
  { conflictingScheduleId }`.
- Endpoint requires any `schedule.create.{own|own-department}`. Scope
  enforcement (via `resolveScheduleCreateScope`):
  - DOCTOR (`.own`): the `doctorId` in the body MUST equal
    `caller.doctor.id`; else `403 INSUFFICIENT_PERMISSION_SCOPE`.
  - NURSE (`.own-department`): the chosen doctor's home department MUST
    equal `caller.user.departmentId`; else
    `403 INSUFFICIENT_PERMISSION_SCOPE`.
- The UI exposes a `ScheduleFormDialog` validated with Zod +
  react-hook-form (per-field errors), reached either from "+ Create
  schedule" in the page header or from the day-details dialog (which
  pre-fills the clicked date). The dialog uses MUI date / time pickers,
  the reusable `SearchableSelect` doctor picker (server-paged), and a
  department field derived from the chosen doctor's home department.
  DOCTOR in mode D / locked create flow sees the doctor + dept
  pre-filled and the picker disabled (matches the BE which only accepts
  `schedule.create.own` for them). Past dates disable the Create CTA.

### US-5.3 — Edits a schedule ✅ shipped

**US-5.3** — As a user holding `schedule.update.own` (DOCTOR) or
`schedule.update.own-department` (NURSE), I want to edit an existing
schedule, so that I can correct mistakes or change hours.

**Acceptance criteria:**

- `PATCH /schedules/:id` accepts a partial of the create payload
  EXCLUDING `doctorId` (moving a schedule between doctors is out of
  scope for F06). `departmentId` IS editable.
- The service merges the patch over the existing row and re-runs every
  cross-field invariant AND the department + overlap + past-`startAt`
  checks against the merged shape. Same error codes as create.
- Endpoint requires any `schedule.update.{own|own-department}`. Scope
  enforcement (via `resolveScheduleUpdateScope`):
  - DOCTOR (`.own`): the schedule's `doctorId` MUST equal
    `caller.doctor.id`; else `403 INSUFFICIENT_PERMISSION_SCOPE`.
  - NURSE (`.own-department`): the schedule's `departmentId` MUST equal
    `caller.user.departmentId`; else `403 INSUFFICIENT_PERMISSION_SCOPE`.
- Editing a schedule does **not** retroactively cancel appointments
  already booked outside the new window — those remain `BOOKED`. F09
  will surface affected counts when it ships.
- The UI opens the same `ScheduleFormDialog` on chip click. Doctor /
  department / date are non-editable in edit mode (the doctor lock
  matches the BE which excludes `doctorId` from `UpdateScheduleDto`).
  Only times + break + `acceptsBooking` are mutable. Past schedules
  (`endAt <= now`) open in read-only form with a banner; the Save button
  is hidden.

### US-5.4 — Deletes a schedule ✅ shipped

**US-5.4** — As a user holding `schedule.delete.own` (DOCTOR) or
`schedule.delete.own-department` (NURSE), I want to remove a schedule, so
that the doctor stops being offered for new bookings inside that window.

**Acceptance criteria:**

- `DELETE /schedules/:id` soft-deletes the row (sets `deletedAt` +
  `deletedBy`) and returns `204 No Content`.
- A follow-up DELETE on the same id returns `404 SCHEDULE_NOT_FOUND` so
  the FE never thinks "succeeded" for a row that was deleted by someone
  else in the interim.
- Endpoint requires any `schedule.delete.{own|own-department}`. Scope
  enforcement (via `resolveScheduleDeleteScope`):
  - DOCTOR (`.own`): the schedule's `doctorId` MUST equal
    `caller.doctor.id`; else `403 INSUFFICIENT_PERMISSION_SCOPE`.
  - NURSE (`.own-department`): the schedule's `departmentId` MUST equal
    `caller.user.departmentId`; else `403 INSUFFICIENT_PERMISSION_SCOPE`.
- Deleting a schedule does NOT cancel existing future appointments
  inside that window; F09 surfaces affected counts when it ships.

---

## E6 — Appointment Types & Slot Finder ✅ shipped (F07, `feat/slots`)

### US-6.1 — List appointment types ✅ shipped

**US-6.1** — As a NURSE / DOCTOR, I want to see the available appointment
types and their durations, so that I can pick the right one when booking.

**Acceptance criteria:**

- `GET /appointment-types` returns the hardcoded list
  `[{ code, label, durationMinutes }]` for `NEW_PATIENT_VISIT`,
  `FOLLOW_UP`, `CONSULTATION`, `PROCEDURE`.
- Endpoint requires `appointment.create.own-department` (NURSE) or
  `appointment.create.own` (DOCTOR). ADMIN does NOT hold either in the
  seeded baseline; grant via `role.update` if an ADMIN must book.

### US-6.2 — Find available slots

**US-6.2** — As a NURSE / DOCTOR, I want to query open slots for a
`(department, doctor, date, appointmentType)`, so that I can pick a time
that matches the per-department booking rules.

**Acceptance criteria:**

- `GET /slots?doctorId=:id&departmentId=:dept&date=YYYY-MM-DD&type=APPOINTMENT_TYPE`
  returns `[{ startAt, endAt, departmentId }]` in chronological order.
  Note the **flat namespace** — `doctorId` is a peer query param, not a
  path segment (the earlier `/doctors/:id/slots` shape was retired in
  F07 so all four required filters are co-equal).
- All four query params are required peers (validated by the DTO). The
  slot finder only considers `DoctorSchedule` rows whose
  `(doctorId, departmentId)` matches the request.
- The requested `(departmentId, appointmentType)` pair MUST exist in
  `department_appointment_types`; otherwise the endpoint returns
  `400 DEPARTMENT_TYPE_NOT_ALLOWED`.
- Slots are computed from active `DoctorSchedule` rows for the requested
  date + department and stepped by `AppointmentType.durationMinutes`.
  Slots overlapping the schedule's break window are excluded.
- Slots overlapping a `BOOKED` or `COMPLETED` appointment for that doctor
  on that day are excluded.
- Slots that start in the past (relative to clinic-local "now") are
  excluded.
- Returns empty array (not `404`) when no slots are available, **including
  the case of a fully-past `date` parameter** — never `400` (the
  past-date case still returns `200 []`).
- Endpoint requires `appointment.create.own-department` (NURSE) or
  `appointment.create.own` (DOCTOR). A NURSE probing a doctor whose
  home department doesn't match the caller's `User.departmentId`
  returns `403 INSUFFICIENT_PERMISSION_SCOPE`; a DOCTOR probing a
  foreign doctor returns the same.

**Notes / assumptions:** The slot finder is the single source of truth for
"is this time bookable?"; the booking endpoints re-validate inside a
transaction to defend against races. The slot's `departmentId` flows into
the resulting `Appointment.departmentId` on booking.

---

## E7 — Front-desk booking on behalf ✅ shipped (F09, `feat/booking`)

**NURSE owns the department-scoped front-desk surface by default**
(`appointment.create.own-department` + full `patient.*` CRUD). **DOCTOR
can act on appointments where they are the assigned doctor**
(`appointment.create.own`). ADMIN does NOT hold any `appointment.*` /
`patient.*` in the seeded baseline; an ADMIN who needs to book must first
grant themselves via `role.update` (US-11.5). There is **no per-caller
ownership filter** on patients — patient records are visible to anyone
holding `patient.read`.

**Shipped UX guarantees (beyond the original brief):**
- The wizard's "Register patient" CTA only renders when the caller
  holds `patient.create` — DOCTOR (who holds only `patient.read`) does
  not see it. Click-through to `/patients/new` is therefore always
  authorised.
- The department field in the booking wizard is locked to the caller's
  home dept for non-`.all` scopes (NURSE, DOCTOR); the doctor picker is
  scoped to the same dept. Picking a doctor first auto-fills the dept
  for `.all`-scope callers (no seeded role today) and the cascade
  clears the doctor when the dept changes.
- The appointment-type Select narrows to the picked department's
  offered types via the new `Department.allowedAppointmentTypes` wire
  field; mismatches still hit the BE `DEPARTMENT_TYPE_NOT_ALLOWED`
  guard as the authoritative gate.

### US-7.1 — Searches for a patient

**US-7.1** — As a user with `patient.read`, I want to search for any
existing patient by name, identification number, or phone, so that I can
book on their behalf.

**Acceptance criteria:**

- `GET /patients?q=:term` returns up to 20 matches with
  `[{ id, firstNameEn, lastNameEn, firstNameTh?, lastNameTh?, dateOfBirth, phone, hn }]`.
- Search is case-insensitive partial match across name (en + th) / phone
  / identification number / HN.
- Endpoint requires the `patient.read` permission (held by NURSE /
  DOCTOR / MRO / PHARMACY by default).
- **No ownership filter** — every match is visible to every authorised
  caller.

### US-7.2 — Books an appointment for any patient

**US-7.2** — As a user holding `appointment.create.own-department`
(NURSE) or `appointment.create.own` (DOCTOR), I want to book an
appointment for a patient on a selected doctor, department, type, and
slot, so that the patient is scheduled.

**Acceptance criteria:**

- `POST /appointments` accepts
  `{ patientId, doctorId, departmentId, appointmentType, startAt, reason? }`.
- The `departmentId` is **inherited from the chosen `DoctorSchedule`** —
  the UI passes back the `departmentId` returned by the slot finder.
- The requested `(departmentId, appointmentType)` pair MUST exist in
  `department_appointment_types`; otherwise reject with
  `code=DEPARTMENT_TYPE_NOT_ALLOWED`.
- The chosen `doctorId`'s home department (`doctor.user.departmentId`)
  MUST equal `departmentId`; otherwise reject with
  `code=DOCTOR_DEPARTMENT_MISMATCH`.
- `reason` is **optional** for every `appointmentType` (was: required
  iff `appointmentType=PROCEDURE`; the `@ValidateIf` was removed in F16
  — clinical narrative belongs on the visit's medical record, not on
  the appointment row). Stored as Postgres `text` (no length cap).
- **Standalone vs. continuation partition** (F14 + F16) — the
  `(previousAppointmentId, appointmentType)` pair forms a clean split:
  - Standalone booking (`previousAppointmentId` absent): `appointmentType`
    MUST equal `NEW_PATIENT_VISIT`; any other type returns
    `400 STANDALONE_APPOINTMENT_TYPE_INVALID`.
  - Continuation booking (`previousAppointmentId` set): `appointmentType`
    MUST be `FOLLOW_UP` or `PROCEDURE`; otherwise
    `400 CONTINUATION_APPOINTMENT_TYPE_INVALID`.
  - A clinical thread therefore starts with one `NEW_PATIENT_VISIT` and
    continues with `FOLLOW_UP` / `PROCEDURE` visits. `CONSULTATION` is
    currently unreachable through this endpoint — it stays in the
    `AppointmentType` enum for future use.
- Endpoint requires any `appointment.create.{own|own-department}`.
  Scope enforcement (via `resolveAppointmentCreateScope`):
  - NURSE (`.own-department`): `departmentId` MUST equal
    `caller.user.departmentId`; else `403 INSUFFICIENT_PERMISSION_SCOPE`.
  - DOCTOR (`.own`): `doctorId` MUST equal `caller.doctor.id`; else
    `403 INSUFFICIENT_PERMISSION_SCOPE`.
- Backend runs inside a `$transaction` with isolation `Serializable`,
  retrying once on Postgres error `40001`.
- Transaction verifies the slot is still available against the active
  schedule (filtered by `(doctorId, departmentId)`) and existing
  appointments; conflicts return `409` with `code=SLOT_TAKEN`.
- On success, persists `Appointment` with `status=BOOKED`,
  `createdBy=<session.userId>`, `endAt = startAt + duration`. The
  `appointments_end_after_start` DB CHECK back-stops the math.
- Returns the created appointment payload.

### US-7.3 — Sees confirmation

**US-7.3** — As a booker, I want a clear confirmation after booking, so
that I know it succeeded and can share details with the patient.

**Acceptance criteria:**

- After a successful `POST /appointments`, the UI navigates to a detail
  page showing the patient, doctor, department, type, date/time, and
  reason.
- A toast/snackbar confirms creation with a localized message.

### US-7.4 — Registers a walk-in patient

**US-7.4** — As a user with `patient.create` (NURSE or MRO), I want to
quickly register a walk-in patient who doesn't yet exist in the system,
so that I can book them without leaving the booking flow.

**Acceptance criteria:**

- `POST /patients` accepts the full demographic payload
  (`{ firstNameEn, lastNameEn, firstNameTh?, lastNameTh?, email?, dateOfBirth, gender, bloodGroup?, identificationNo, phone, emergencyPersonName, emergencyPersonRelation, emergencyPersonPhone, address }`).
- `hn` is assigned by the backend (not in the request payload) and must
  match the CHECK `^[0-9]{7,9}$`.
- `email` (if provided) is lowercased via `normalizeEmail()` and stored
  with the unique constraint.
- Endpoint requires the `patient.create` permission (NURSE / MRO by
  default; `patient.*` is scope-less).
- The created patient row is accessible to every authorised caller — no
  per-creator ownership relation is recorded.
- Returns the created patient; the UI then uses it in the booking wizard.

---

## E8 — Appointment lifecycle ✅ shipped (F09, `feat/booking`)

Per-verb scope-aware permissions:
- **NURSE** holds `appointment.{read,update,delete}.own-department`.
- **DOCTOR** holds `appointment.{read,update,delete}.own` plus
  `appointment.read.own-department` for cross-coverage context.
- **MRO** holds `appointment.read.all` — global read, no writes.
- ADMIN / PHARMACY hold nothing by default.

**Shipped UX guarantees (beyond the original brief):**
- The `/appointments` filter card auto-pins department + doctor based
  on the caller's effective `appointment.read.*` scope (see
  `apps/web/src/appointment/scope.ts`): `.own` alone → both locked,
  `.own ∪ .own-department` → dept locked, doctor editable,
  `.own-department` alone → dept locked, doctor editable + scoped,
  `.all` → both editable. Cross-scope filter values return
  `403 INSUFFICIENT_PERMISSION_SCOPE` from the BE; the global error
  boundary surfaces the friendly card.
- Doctor-first selection in the filter narrows the department dropdown
  to that doctor's home department only — prevents picking a
  department that doesn't host the picked doctor.
- Sidebar's longest-prefix highlight resolution: visiting
  `/appointments/new` activates only "Book appointment", not also
  "Appointments". Future sibling routes (e.g. `/patients` + future
  `/patients/new`) inherit the same fix automatically.
- The slot finder's blocker query covers the union of fetched schedule
  windows (not just the requested UTC day), so a schedule that crosses
  midnight UTC never re-emits an already-booked slot.

### US-8.1 — Lists appointments

**US-8.1** — As a user holding any `appointment.read.*`, I want a
filterable list of appointments, so that I can find a specific one to
manage.

**Acceptance criteria:**

- `GET /appointments?doctorId=&patientId=&departmentId=&from=&to=&status=`
  returns the shared `Paginated<AppointmentResponse>` envelope.
- Default sort: `startAt ASC` for future, `startAt DESC` for past
  (controlled by `order` query param `asc|desc`).
- Endpoint accepts any `appointment.read.{own|own-department|all}` —
  service narrows by the widest scope held. A request explicitly setting
  filters outside the caller's scope returns
  `403 INSUFFICIENT_PERMISSION_SCOPE`.

### US-8.2 — Views appointment detail

**US-8.2** — As a user holding any `appointment.read.*`, I want to view
the full detail of one appointment, so that I can confirm fields before
any change.

**Acceptance criteria:**

- `GET /appointments/:id` returns the appointment with embedded patient,
  doctor, and department (name).
- Endpoint accepts any `appointment.read.{own|own-department|all}`;
  the service rejects access to rows outside the caller's scope with
  `404 APPOINTMENT_NOT_FOUND` (no existence leak).
- `404` with `code=APPOINTMENT_NOT_FOUND` for missing IDs.

### US-8.3 — Cancels an appointment

**US-8.3** — As a user holding `appointment.delete.own` (DOCTOR) or
`appointment.delete.own-department` (NURSE), I want to cancel an
appointment, so that the slot becomes free for reuse.

**Acceptance criteria:**

- `POST /appointments/:id/cancel` sets `status=CANCELLED`,
  `cancelledBy=<session.userId>`, `cancelledAt=now`, and optional
  `cancellationReason` from the request body.
- Endpoint requires any `appointment.delete.{own|own-department}`.
  Scope enforcement (via `resolveAppointmentDeleteScope`):
  - DOCTOR (`.own`): `appointment.doctorId === caller.doctor.id`.
  - NURSE (`.own-department`): `appointment.departmentId === caller.user.departmentId`.
  Mismatch returns `403 INSUFFICIENT_PERMISSION_SCOPE`.
- Cancelling an already-cancelled appointment returns `409` with
  `code=APPOINTMENT_ALREADY_CANCELLED`.
- After cancellation, the slot is immediately available to other bookings
  (verified by re-running US-6.2). Appointments do NOT carry
  `deletedAt` / `deletedBy` — `status=CANCELLED` replaces soft-delete.
- UI shows a confirm dialog before calling the endpoint.

---

## E9 — Medical records ✅ shipped (F08, `feat/medical-records`)

Per-appointment clinical note authored by the assigned doctor. **Records
are permanent** — no soft-delete column and no `medical_records.delete`
permission. `medical_records.appointmentId` is `@unique` so a duplicate
`POST /medical-records` returns `409 MEDICAL_RECORD_ALREADY_EXISTS`.
Per-role baseline:
- **DOCTOR** — `medical_records.read.all` + `.create.own` + `.update.own`.
- **NURSE** — `medical_records.read.all`.
- **MRO** — `medical_records.read.all` + `.update.all`.
- **PHARMACY** — `medical_records.read.all`.

### US-9.1 — Doctor authors a medical record

**US-9.1** — As a DOCTOR with `medical_records.create.own`, I want to
create a medical record attached to one of my own appointments, so that
the patient's clinical history is captured.

**Acceptance criteria:**

- `POST /medical-records` accepts
  `{ appointmentId, doctorId, patientId, note, drug? }`.
- Service verifies `appointment.doctorId === body.doctorId`, copies
  `departmentId` from the appointment as a denorm cache, and enforces
  `doctorId === caller.doctor.id`; mismatch returns
  `403 INSUFFICIENT_PERMISSION_SCOPE`.
- Returns the created record with embedded patient / department.

### US-9.2 — Doctor updates their own medical record

**US-9.2** — As a DOCTOR with `medical_records.update.own`, I want to
update a record I authored, so that I can correct or extend the note.

**Acceptance criteria:**

- `PATCH /medical-records/:id` accepts a partial of the create payload.
- Scope enforcement (via `resolveMedicalRecordsUpdateScope`): DOCTOR
  with `.own` may only update records where
  `record.doctorId === caller.doctor.id`. Foreign records return
  `403 INSUFFICIENT_PERMISSION_SCOPE`.

### US-9.3 — NURSE reads medical records in their department

**US-9.3** — As a NURSE with `medical_records.read.all`, I want to view
any medical record (typically scoped by the patient / appointment lookup
they're already filtering by), so that I can prepare clinical context for
the booked visit.

**Acceptance criteria:**

- `GET /medical-records?appointmentId=&patientId=&doctorId=` returns the
  paginated list filtered by the supplied params.
- NURSE may read any record; the seeded baseline grants `read.all`. (A
  future tightening could narrow NURSE to `read.own-department`; in the
  current seed every nurse can read any record.)

### US-9.4 — MRO reads and updates any medical record

**US-9.4** — As an MRO with `medical_records.update.all`, I want to
correct or annotate any medical record, so that records officers can
maintain data quality across departments.

**Acceptance criteria:**

- `PATCH /medical-records/:id` accepts the same partial payload as
  US-9.2. With `.update.all` the service applies no scope narrowing.
- MRO also holds `medical_records.read.all` for full read access.

### US-9.5 — PHARMACY reads any medical record

**US-9.5** — As a PHARMACY user with `medical_records.read.all`, I want
to read any medical record (especially the `drug` field) for medication
preparation, so that I can dispense correctly without booking access.

**Acceptance criteria:**

- `GET /medical-records/:id` returns the full record (incl. `drug`).
- PHARMACY holds no write permissions on `medical_records` — every
  mutate attempt returns `403 INSUFFICIENT_PERMISSION`.

---

## E11 — Admin user management (P1)

ADMIN-only operations to invite, list, and disable other users, plus
runtime role / permission management via the `role.update` capability.
Baseline `roles` + `policies` rows are pinned `is_deletable=false` so the
seeded grants cannot be revoked through the admin UI.

### US-11.1 — Admin invites a user

**US-11.1** — As an ADMIN, I want to pre-create a `User` of any
sign-in-eligible role (ADMIN / DOCTOR / NURSE / MRO / PHARMACY) by email
and role, so that they can sign in via Google immediately.

**Acceptance criteria:**

- `POST /admin/users` accepts
  `{ email, roleCode, departmentId?, firstNameEn, lastNameEn, firstNameTh?, lastNameTh?, doctor? }`.
- `departmentId` MUST be set for `DOCTOR` and `NURSE` (department-scoped
  roles) and MUST be `null` for `ADMIN`, `MEDICAL_RECORDS_OFFICER`,
  `PHARMACY` (cross-department / non-clinical). Enforced at the DTO /
  service layer.
- For `roleCode = 'DOCTOR'`, the request MUST include a `doctor`
  sub-object carrying `{ doctorCode, medicalLicenseNo, identificationNo, gender?, phone, address? }`.
  The backend transactionally creates the `User` (with `departmentId`
  set as the doctor's home department) and the `Doctor` (1-1).
  Doctor↔Department is 1:1 via `User.departmentId` — there is no
  `doctor_departments` join table.
- Endpoint requires the `user.create` permission (ADMIN only by default).
- Backend rejects emails whose domain is not in
  `STAFF_ALLOWED_DOMAINS` with `code=STAFF_DOMAIN_NOT_ALLOWED`.
- Backend rejects duplicate emails with `code=USER_EMAIL_EXISTS`.
- Backend rejects duplicate `doctorCode` / `medicalLicenseNo` with
  `code=DOCTOR_CODE_EXISTS` / `MEDICAL_LICENSE_EXISTS`.
- `googleSub` is left null; it gets filled when the user first signs in.

### US-11.2 — Admin lists and filters users

**US-11.2** — As an ADMIN, I want to see all users with their role and
status, so that I can audit access.

**Acceptance criteria:**

- `GET /admin/users?roleCode=&disabled=` returns
  `[{ id, email, firstNameEn, lastNameEn, firstNameTh?, lastNameTh?, roleCode, departmentId?, deletedAt, createdAt }]`.
- Default returns active users only (`deletedAt IS NULL`); pass
  `disabled=true` to include soft-deleted.
- Endpoint requires the `user.read` permission (ADMIN only by default).

### US-11.3 — Admin soft-revokes a user

**US-11.3** — As an ADMIN, I want to disable another user account, so that
they can no longer sign in while preserving their audit trail.

**Acceptance criteria:**

- `POST /admin/users/:id/disable` sets `deletedAt = now` and
  `deletedBy = <session.userId>` on the `users` row (the user's "disabled"
  state is its soft-delete cluster).
- Endpoint requires the `user.delete` permission (ADMIN only by default).
- Disabled users fail `/auth/resolve` (returns `code=USER_DISABLED`);
  their existing `Appointment.createdBy` / `cancelledBy` references
  remain intact (audit FKs use `ON DELETE NO ACTION`).
- ADMIN cannot disable their own account (`code=CANNOT_DISABLE_SELF`).
- A reactivation endpoint `POST /admin/users/:id/enable` clears
  `deletedAt` / `deletedBy` and requires `user.update`.

### US-11.5 — Admin assigns permissions to roles

**US-11.5** — As an ADMIN, I want to grant or revoke specific permissions
on a role (including custom roles, and ADMIN itself), so that I can tune
the RBAC matrix without code changes.

**Acceptance criteria:**

- `POST /admin/roles/:id/policies` accepts `{ permissionId }` and creates
  a new `Policy` row linking the role to the permission with
  `is_deletable=true`. Idempotent: a duplicate grant returns the existing
  policy (or `409 POLICY_EXISTS` — either is acceptable for v1).
- `DELETE /admin/roles/:id/policies/:permissionId` removes the policy.
  Rejects with `409 POLICY_NOT_DELETABLE` if the target row carries
  `is_deletable=false` (i.e. every seeded baseline grant).
- Endpoint requires the `role.update` permission (ADMIN only by default).
- ADMIN can use this endpoint to grant themselves clinic-operations
  permissions (e.g. `appointment.create.own-department`) that are NOT in
  the seeded baseline. This is the canonical path for an ADMIN who needs
  to act as a booker.
- After a grant/revoke, the per-request permission cache is invalidated
  on the next call from any affected user — practically this means the
  user's permission set is re-read on each request anyway, so no
  explicit invalidation is required.

**Notes / assumptions:** The seeded baseline (ADMIN→9, DOCTOR→15,
NURSE→14, MRO→9, PHARMACY→3) is the starting point. Admins may grant
additional permissions to any role via this endpoint, but cannot revoke
any seeded baseline policy.

### US-11.6 — Admin creates a custom role (P2)

**US-11.6** — As an ADMIN, I want to create a new role (e.g. "Receptionist
Lead") and assign permissions to it, so that I can introduce role
variations without a schema change.

**Acceptance criteria:**

- `POST /admin/roles` accepts `{ code, name, description? }` and creates a
  new `Role` row (`code` is unique and conventionally UPPER_SNAKE) with
  `is_deletable=true`.
- Endpoint requires the `role.create` permission (ADMIN only by default
  via the seeded baseline).
- Returns the new role; the admin then attaches policies via US-11.5
  (which requires `role.update`).
- **Priority: P2.** Cuttable for the take-home; may ship as data-only with
  no dedicated UI.

**Notes / assumptions:** P1 ships US-11.1 / 11.2 / 11.3 / 11.5 with both
API and a simple `/admin/users` UI in ONE feature (F11) — no API/UI
split. US-11.6 is P2 and may ship API-only.

---

## E12 — i18n parity & README (P1)

### US-12.1 — All user-facing strings localized to en + th

**US-12.1** — As a user reading in English or Thai, I want every visible
string to be in my locale, so that the app is fully usable in both
languages.

**Acceptance criteria:**

- No raw English strings in JSX outside `messages/*.json`.
- `keys.generated.ts` is regenerated and contains all keys used by the
  app; CI / `pnpm type-check` fails on missing keys.
- The admin UI in F11 adds `Roles.*` and `Permissions.*` message
  namespaces (role display labels and permission code descriptions),
  localized for en + th.
- Date/time formatting respects locale (next-intl `useFormatter`).
- Server-rendered error pages (404, error boundary) honor the locale
  prefix.

### US-12.2 — README walks a reviewer through local setup

**US-12.2** — As a reviewer (or new contributor), I want a README that
gets me to a running app in under 15 minutes, so that I can review the
take-home end-to-end.

**Acceptance criteria:**

- Repo `README.md` covers: prerequisites (Node, pnpm, Docker), `.env`
  files for `apps/web` and `apps/api`, `pnpm install`, `pnpm db:up`,
  `pnpm prisma migrate dev`, `pnpm db:seed`, `pnpm dev`.
- Documents the seeded sign-in emails (`admin1@gmail.com`,
  `admin2@gmail.com`, `nurse1@gmail.com`, `records1@gmail.com`,
  `pharmacy1@gmail.com`, and 75 DOCTOR rows `doctor01@gmail.com` …
  `doctor75@gmail.com`; patients do not sign in).
- Documents how to verify the RBAC baseline (5 seeded roles, 35
  permissions, 50 policies — ADMIN→9, DOCTOR→15, NURSE→14,
  MEDICAL_RECORDS_OFFICER→9, PHARMACY→3).
- Links to Swagger at `/api/v1/docs` and to the feature roadmap.
- Calls out known deferred items (`COMPLETED` transition, profile edit,
  notifications, patient self-service).

---

## E13 — Per-(department, type) booking rules (P1, F13 `feat/dept-type-rules`)

Today the per-`AppointmentType` slot duration (`NEW_PATIENT_VISIT=30`,
`FOLLOW_UP=15`, `CONSULTATION=20`, `PROCEDURE=60`) lives in a single
global const map and every type is bookable any time of day a doctor is
working. Real clinics need per-department control: an ortho `PROCEDURE`
may need 90 minutes; cardiology may want `NEW_PATIENT_VISIT` confined to
mornings so the doctor can run follow-ups in the afternoon.

This feature moves both rules onto the existing `department_appointment_types`
join table — per-pair `durationMinutes` + nullable `bookingWindowStartMinute`
/ `bookingWindowEndMinute` (wall-clock local minute-of-day in the new
`CLINIC_TIMEZONE` env, default `Asia/Bangkok`). Booking-window
enforcement: `SlotsService` filters slots whose `startAt` (converted to
local time) falls outside the window; `AppointmentsService.create`
back-stops with `400 APPOINTMENT_OUTSIDE_BOOKING_WINDOW`.

See CLAUDE.md §9a — booking windows are wall-clock local time, not UTC
minute-of-day; the comparison happens at the check site via
`dayjs.utc(startAt).tz(CLINIC_TIMEZONE)`.

### US-13.1 — Per-department appointment-type catalog

**US-13.1** — As a NURSE or DOCTOR opening the booking wizard for a
department, I want to see the appointment types that department offers
along with each type's duration and booking window, so that I understand
the slot grid the wizard is about to render.

**Acceptance criteria:**

- `GET /departments/:id/appointment-types` returns
  `[{ code, label, durationMinutes, bookingWindowStartMinute?,
       bookingWindowEndMinute? }]` — one row per
  `department_appointment_types` entry for that department.
- The booking wizard's type chip renders the window copy when set
  (e.g. "Before 11:00 only" or "09:00 – 12:00"), so the user understands
  why later slots may be hidden.
- The legacy `GET /appointment-types` becomes a pure label catalog
  (drops `durationMinutes` from the wire). Any FE consumer reading
  `durationMinutes` from the global endpoint MUST switch to the
  per-department endpoint.

### US-13.2 — Slot finder hides slots outside the booking window

**US-13.2** — As a NURSE booking `NEW_PATIENT_VISIT` in a department
that restricts the type to mornings, I want the slot grid to omit
afternoon slots automatically, so that I never offer the patient a
forbidden slot.

**Acceptance criteria:**

- `SlotsService` reads `bookingWindowStartMinute` /
  `bookingWindowEndMinute` from the `(departmentId, type)` row it
  already loads for the `DEPARTMENT_TYPE_NOT_ALLOWED` check (no extra
  round-trip).
- For each grid slot, computes
  `local = dayjs.utc(startAt).tz(CLINIC_TIMEZONE)` minute-of-day; drops
  the slot when `start ≤ local < end` is violated (either bound may be
  null = open-ended on that side).
- Slots already excluded by past-time / booked / break-window logic
  continue to be excluded; window filtering composes.

### US-13.3 — Appointment create rejects bookings outside the window

**US-13.3** — As the backend, I want `POST /appointments` to back-stop
the wizard's window filter, so that a direct API caller bypassing the
wizard cannot book a forbidden slot.

**Acceptance criteria:**

- After the existing `(departmentId, appointmentType)` validation,
  `AppointmentsService.create` recomputes the local minute-of-day for
  the proposed `startAt` and rejects bookings outside the window with
  `400 APPOINTMENT_OUTSIDE_BOOKING_WINDOW`.
- The new code is added to `apps/api/src/common/errors.ts`.

### US-13.4 — Per-pair duration drives `endAt`

**US-13.4** — As the backend, I want
`Appointment.endAt = startAt + departmentAppointmentType.durationMinutes`,
so that the slot length matches each department's policy.

**Acceptance criteria:**

- The global `APPOINTMENT_TYPE_DURATION_MINUTES` map is removed.
- `SlotsService` slot grid step + `AppointmentsService.create` both
  read `durationMinutes` from the `(departmentId, type)` join row.
- Existing appointments keep their baked-in `endAt` — no migration
  retro-fits historical rows.
- Seed includes at least one non-default duration (e.g. Orthopedics
  `PROCEDURE = 90`) so reviewers can spot-check the override works.

---

## E14 — Appointment groups + referrals (P1, F14 `feat/referrals`)

Today every appointment is a standalone row. Real clinics need to link
visits within a clinical thread: a follow-up to a prior `NEW_PATIENT_VISIT`
belongs in the same case, and a referral to another specialist
continues that case in a different department. Without grouping, "all
visits for Mrs. Smith's diabetes thread" is unrecoverable from the
patient's mixed timeline of unrelated complaints.

This feature adds an `appointment_groups` table and lazily materialises
a group whenever a continuation is booked. Referral state lives as three
columns on `Appointment` (no separate referral table) — the originating
row IS the referral record. Permissions reuse the existing
`appointment.*` family — no new permission codes.

**Schema additions:**
- `AppointmentGroup { id, patientId, openedAt, closedAt?, audit }` —
  `openedAt` is the clinical source-of-truth for case start, distinct
  from audit `created_at`. No `deleted_at` / `deleted_by` (mirrors
  `Appointment`).
- `Appointment.appointmentGroupId String?` — NULL for standalone visits.
- `Appointment.visitNumber Int?` — 1-indexed within group; NULL when
  standalone. Partial unique on `(group_id, visit_number)`.
- `Appointment.referredToDepartmentId String?` — destination, free
  choice.
- `Appointment.referredAt DateTime?` — when the referral was
  initiated.
- `Appointment.referralFulfilledByAppointmentId String?` — `@unique`,
  links to the receiving appointment once B picks up the referral.

### US-14.1 — Front-desk continues an existing case

**US-14.1** — As a NURSE booking a follow-up or referral pickup, I want
to pick "Continue case" from a list of the patient's prior visits, so
that the new appointment is linked into the same clinical thread.

**Acceptance criteria:**

- The booking wizard adds a step after patient selection:
  "Is this a continuation of a prior visit?" — default **No**.
- **Yes** branch shows a picker listing the patient's prior
  non-cancelled appointments (open groups + ungrouped). Each row shows
  date, department, doctor, and (if grouped) `visit_number`.
- Picking a row sets `previousAppointmentId` in the `POST /appointments`
  payload.
- `GET /appointment-groups?patientId=&status=open|closed|all` provides
  the data (open + closed groups filterable, with member count + latest
  visit summary). Gated on `appointment.read.*`.

### US-14.2 — Group materialises lazily on continuation booking

**US-14.2** — As the backend, I want a group to be created
automatically inside `POST /appointments` when `previousAppointmentId`
is supplied, so that the front-desk never has to call a separate
"open case" endpoint.

**Acceptance criteria:**

- `POST /appointments` accepts optional `previousAppointmentId`. The
  service runs the following in one transaction:
  1. Validate prev exists, same patient, `status != CANCELLED` (else
     `400 PREVIOUS_APPOINTMENT_CANCELLED`).
  2. If prev has a group → assert `closed_at IS NULL`; new row joins
     same `group_id` with `visit_number = max(group.visit_number) + 1`.
     Group-closed → `400 APPOINTMENT_GROUP_CLOSED`.
  3. If prev has no group → create a fresh `AppointmentGroup` →
     back-link prev (`group_id`, `visit_number = 1`) → insert new
     (`group_id`, `visit_number = 2`).
  4. If prev's `referredToDepartmentId` is set AND new's
     `departmentId` matches → also set
     `prev.referralFulfilledByAppointmentId = new.id`. Mismatch →
     `400 REFERRAL_DEPARTMENT_MISMATCH`. Already fulfilled →
     `409 REFERRAL_ALREADY_FULFILLED`.
- Existing appointments (pre-F14) remain ungrouped — no backfill.

### US-14.3 — Doctor completes a visit

**US-14.3** — As a DOCTOR finishing a visit that does not refer and
does not end the case, I want a "Complete visit" action that marks the
appointment `COMPLETED` without committing to a next step, so that the
front-desk can book the follow-up later.

**Acceptance criteria:**

- `POST /appointments/:id/complete` transitions `status` from `BOOKED`
  to `COMPLETED`. Idempotent on `COMPLETED`; rejects from `CANCELLED`
  with `409 APPOINTMENT_NOT_BOOKED`.
- Auth: caller must be the doctor on the appointment
  (`appointment.update.own`).
- No group / referral side-effect — this is the "completion-only"
  ending, symmetric with `cancel`.

### US-14.4 — Doctor refers a visit to another department

**US-14.4** — As a DOCTOR finishing a visit and deciding to refer the
patient to another specialist, I want a single "Refer to department"
action that completes my visit AND records the referral, so that the
destination department's queue picks it up.

**Acceptance criteria:**

- `POST /appointments/:id/refer` body
  `{ toDepartmentId: <any departmentId> }`. Atomic:
  - `status` → `COMPLETED`.
  - `referredToDepartmentId` ← body.
  - `referredAt` ← `now()`.
- The group stays open — closing is a separate action (US-14.6).
- Auth: caller must be the doctor on the appointment
  (`appointment.update.own`).
- Free department choice — the patient may have never visited the
  destination department before.
- A second referral attempt on the same row returns
  `409 APPOINTMENT_ALREADY_REFERRED` (the referral pair is set
  exactly once per row).

### US-14.5 — Destination NURSE picks up a pending referral

**US-14.5** — As a NURSE in the destination department, I want to see
patients referred to my department and book their next appointment, so
that the referral flow completes end-to-end.

**Acceptance criteria:**

- `GET /appointments?pendingReferralToDepartmentId=<myDept>` returns
  rows where `referred_to_department_id = myDept` AND
  `referral_fulfilled_by_appointment_id IS NULL`. Existing
  `appointment.read.own-department` scope applies — a NURSE only sees
  pending referrals TO their own dept.
- Booking from the queue routes to the standard `POST /appointments`
  wizard with `previousAppointmentId` pre-filled to the source row.
  US-14.2 step (4) sets the fulfilment FK in the same transaction.
- The booked appointment joins (or creates) the source row's group —
  the patient's case now spans two departments with consecutive
  `visit_number` values.

### US-14.6 — Doctor closes a case

**US-14.6** — As the DOCTOR of the latest non-cancelled appointment in
a group, I want a single "Complete + close case" action that completes
my visit AND ends the case, so that subsequent visits cannot accidentally
attach to a resolved case.

**Acceptance criteria:**

- `POST /appointment-groups/:id/close` atomically:
  - Sets the group's `closedAt = now()`.
  - Transitions the latest non-cancelled appointment in the group from
    `BOOKED` to `COMPLETED` (idempotent on `COMPLETED`).
- Auth: caller must be the doctor on the latest non-cancelled
  appointment; else `403 APPOINTMENT_GROUP_CLOSE_FORBIDDEN`.
- A `POST /appointments` later with `previousAppointmentId` pointing
  into a closed group returns `400 APPOINTMENT_GROUP_CLOSED` (the
  case is over).

### US-14.7 — Read a patient's clinical timeline by group

**US-14.7** — As a NURSE / DOCTOR / MRO / PHARMACY (per existing read
scopes), I want to see a patient's clinical threads grouped, so that I
can review each case as a unit instead of an undifferentiated mixed
timeline.

**Acceptance criteria:**

- `GET /appointment-groups?patientId=<uuid>&status=open|closed|all`
  returns paginated groups for that patient, each with `member_count`,
  `latest_visit_summary` (`startAt`, `departmentName`, `doctorName`),
  and `openedAt` / `closedAt?`. Gated on `appointment.read.*` — caller
  must hold a scope covering at least one member appointment.
- `GET /appointment-groups/:id` returns the full chronological member
  list with each appointment's `visit_number`, `department`, `doctor`,
  `status`, `referredToDepartmentId?`,
  `referralFulfilledByAppointmentId?`. Same auth.
- Ungrouped (standalone) appointments are NOT listed by these endpoints
  — they remain visible via the existing `GET /appointments?patientId=`.

---

## E15 — Slot finder (P1, F15 `feat/slot-finder`)

Today the only way to discover available slots is to start the booking
wizard (F09), pick a patient, then drill down through department → doctor
→ date → type to reach the slot grid. That workflow is fine when the
caller knows "I want Dr. Smith at time Y." It is the wrong shape for
**"any doctor in this department who has a 30-minute follow-up open
tomorrow"** — a workflow that comes up when a patient calls in flexibly,
or when a referral lands in a new department and the NURSE needs to
scan the team's availability fast.

This feature delivers a dedicated `/find-slot` screen that lets the
caller filter by department / doctor / appointment type / date, lists
the matching open slots across one or many doctors, and offers a
"Book this slot" CTA that deep-links into the booking wizard with the
slot pre-selected.

**Wire model:**
- Extends F07's `GET /slots` to make `doctorId` **optional**. When
  omitted, the service iterates over every doctor with an active
  schedule in `departmentId` on the requested `date` and merges their
  slot grids.
- Extends the `/slots` permission gate to accept `schedule.read.all`
  IN ADDITION TO the existing `appointment.create.{own,own-department}`.
  This widens the endpoint's audience to cross-department read roles
  (currently MRO) so they can use the slot finder as a read-only
  visibility tool. PHARMACY stays excluded — they hold no
  `schedule.read.*` permission.

**View mode is driven by `schedule.read.*` codes** — mirrors F06's
schedule page (lift `resolveScheduleViewMode()` verbatim):

| Caller permissions | View mode | UI |
| --- | --- | --- |
| `schedule.read.all` | **ALL** | Department picker visible. Doctor picker not scoped. |
| `schedule.read.own-department` + `schedule.read.own` | **OWN_PLUS_DEPT** | "Show mine" / "Show department" toggle (defaults to `mine`). `mine` pins the caller's doctor; `dept` shows a doctor picker scoped to the caller's department. Department always pinned to caller. |
| `schedule.read.own-department` only | **DEPT** | Doctor picker scoped to caller's department. Department pinned (not selectable). |
| `schedule.read.own` only | **OWN** | No filters. Caller's doctor pinned. |
| None of the above | Forbidden card. Sidebar entry hidden. |

### US-15.1 — Caller filters open slots for a chosen day

**US-15.1** — As any caller authorised to view the slot finder, I want
to pick a department / doctor / appointment type / date and see the
open slots that match, so that I can find a bookable time without
walking the booking wizard first.

**Acceptance criteria:**

- Route `/find-slot`. Filter card at the top, results list below.
- **Appointment type is required** — the Search button stays disabled
  until a type is picked. Type catalog comes from
  `GET /departments/:id/appointment-types` (F13) so durations + booking
  windows render per-pair correctly.
- **Date** is a single-date picker, defaults to today (FE timezone:
  `CLINIC_TIMEZONE`).
- **Department** filter visible only in ALL mode (MRO). For DEPT /
  OWN_PLUS_DEPT callers, the department is pinned to
  `session.user.departmentId` and hidden.
- **Doctor** filter visible in ALL, DEPT, and OWN_PLUS_DEPT+dept.
  Doctor picker is scoped to the **effective department** in scope —
  the same narrowing pattern as F06's schedule page doctor filter.
  When the doctor is left empty, the result includes every doctor with
  schedules on that day.
- Results: list grouped by doctor, each slot row shows time
  (`HH:mm – HH:mm` in `CLINIC_TIMEZONE`), the doctor's name + code, and
  the booking-window context when relevant.
- Empty result renders a "no open slots" message keyed by i18n.

### US-15.2 — View mode adapts to the caller's schedule-read scope

**US-15.2** — As a DOCTOR who can see their own AND their department's
schedules, I want a "Show mine" / "Show department" toggle on the slot
finder, so that I can flip between scanning my own availability and
finding a colleague to refer to, without leaving the page.

**Acceptance criteria:**

- The toggle is rendered only in OWN_PLUS_DEPT mode. Default scope is
  `mine` (matches F06's default).
- `mine` scope: doctor pinned to `caller.doctor.id`, doctor picker
  hidden, results limited to caller's slots.
- `dept` scope: doctor picker appears (scoped to caller's department);
  results include every doctor in that dept unless the picker narrows.
- Department is always pinned to caller's `departmentId` in this mode
  (no department picker).
- NURSE in DEPT mode sees no toggle. ALL-scope MRO sees no toggle
  either — they pick department + doctor freely.
- The toggle and filter state are reflected in the URL (`?scope=mine|dept`,
  `?doctorId=`, etc.) so deep-links and Back-button navigation behave
  correctly. Matches F06's URL contract.

### US-15.3 — `/slots` endpoint accepts `schedule.read.all` callers

**US-15.3** — As an MRO with `schedule.read.all` but no
`appointment.create.*` permission, I want to use the slot finder as a
read-only visibility tool, so that I can answer cross-department
availability questions without holding write permissions.

**Acceptance criteria:**

- `GET /slots` permission gate widens from
  `appointment.create.{own,own-department}` (current) to ALSO accept
  `schedule.read.all` (any-of). Existing callers continue to pass via
  the create-permission branch.
- `doctorId` query param becomes optional. When omitted, the service
  iterates over every doctor with an active schedule in
  `departmentId` on the requested `date` and merges their slot grids.
- Response shape unchanged — array of slot objects each carrying
  `startAt`, `endAt`, `doctorId`, `doctorCode`, `doctorName`,
  `departmentId`.
- For MRO callers, the "Book this slot" CTA is hidden on the FE (they
  hold neither `appointment.create.own` nor `.own-department`). The
  slot list remains visible.

### US-15.4 — "Book this slot" deep-links into the booking wizard

**US-15.4** — As a NURSE / DOCTOR with appointment-create scope, I
want clicking "Book this slot" to take me into the booking wizard with
the slot, doctor, department, and type already populated, so that the
only thing left to choose is the patient.

**Acceptance criteria:**

- "Book this slot" CTA is rendered per row only when the caller holds
  `appointment.create.{own,own-department}` (any-of, scope-narrowed
  against the row's doctor/department).
- The CTA links to
  `/appointments/new?doctorScheduleId=<id>&startAt=<iso>&appointmentType=<code>&departmentId=<id>`.
- The booking wizard, on detecting these query params, skips its
  department / doctor / date / type steps (locked, read-only) and
  lands on the patient picker as the first user-actionable step.
- After successful booking, the user returns to the standard
  appointment-detail page (not back to the slot finder).
- A DOCTOR caller in `mine` scope sees the CTA on their own slots only
  (BE rejects `appointment.create.own` for foreign doctors — the FE
  hides the CTA in advance to prevent the dead click).

---

## E17 — Doctor workspace ✅ shipped (F17, `feat/doctor-workspace`)

> **Delta from the original AC, captured during F17 implementation:**
> The doctor surface landed as **two dedicated routes**, not an enhanced
> appointment detail. (1) `/workspace` lists the doctor's visits split
> into two sections — **Upcoming** (`BOOKED`) on top, **History**
> (`COMPLETED` + `CANCELLED`) below. (2) Clicking a row opens a
> **dedicated `/workspace/:id`** page (NOT `/appointments/:id`) that
> hosts the patient panel, the medical-records history, and — for
> `BOOKED` visits only — the note + actions panel. `/appointments/:id`
> was reverted to its plain F09 read-only form for every role.
> A new **`GET /patients/:id`** endpoint was added to feed the patient
> panel. The medical-record cards show the **authoring doctor + department**
> (the `GET /medical-records` response already carried both as nested
> refs). The workspace list rows reuse `AppointmentListRow`; the row's
> date/time is NOT a link — navigation is the patient-name link + the
> right-edge arrow icon button.

Today a doctor's only inbound surface is the generic `/appointments`
list. Once they open an appointment, the page mixes patient demographics
with three loosely-related action buttons (Complete / Refer / Close
Case) and no clinical context — they can't see the rest of the visit
thread (the patient's prior notes in the same case), and they can't
write the visit's clinical note from this page (medical records had to
be POSTed separately).

E17 introduces a focused doctor surface: a dedicated **workspace** list
page (`/workspace`) that separates upcoming BOOKED visits from past
ones, and a **dedicated workspace detail page** (`/workspace/:id`,
reachable only when the caller IS the appointment's doctor) that shows
the patient panel, the **medical-records history for the case**, and —
while the visit is still `BOOKED` — a **note-taking panel** whose note +
drug ride along with the doctor's chosen end-of-visit action. The plain
`/appointments/:id` detail page stays unchanged for every role (no
doctor panels, no end-of-visit buttons; cancel only).

The visit-ending actions collapse the prior `Complete` / `Close Case`
pair into a single **Complete** (always closes the group) and add
**Follow Up** (atomically: completes current visit + creates a new
FOLLOW_UP appointment in the same group). **Refer** keeps its existing
shape but now also absorbs the note + drug fields. Every action
**always creates a `medical_records` row** in the same transaction —
medical records are now write-once, immutable, and the only way to
author one is via a workspace action.

This epic also lands the **RBAC catalog delta** that the new flow
allows: `medical_records.{create.own, update.own, update.all}` are
deleted (creation moves inside the appointment action endpoints, and
records become permanent), and a new `doctor_workspace.read.own`
permission gates the workspace nav item + page on the FE. No new BE
permission is introduced for writes — the workspace actions inherit
existing `appointment.update.own` (Complete / Refer / Follow Up).

### RBAC delta (catalog goes from 35 → 33 perms, 50 → 48 policies)

| Action | Code | Effect |
| --- | --- | --- |
| ADD | `doctor_workspace.read.own` | DOCTOR-only. FE gate for the workspace nav item + `/workspace` page guard. BE does NOT check this code anywhere — workspace data reads continue to flow through `appointment.read.own` + `medical_records.read.all`. |
| DEL | `medical_records.create.own` | Standalone `POST /medical-records` is removed; record creation moves inside the three appointment-action endpoints. |
| DEL | `medical_records.update.own` | `PATCH /medical-records/:id` is removed; records become write-once. |
| DEL | `medical_records.update.all` | Same — records become write-once. MRO becomes read-only on records. |

Post-delta the `medical_records.*` family holds exactly one code
(`medical_records.read.all`). Per-role baseline:
- **DOCTOR** — 14 perms (was 15: −create.own −update.own +doctor_workspace.read.own).
- **NURSE** — 14 perms (unchanged).
- **MEDICAL_RECORDS_OFFICER** — 8 perms (was 9: −update.all). MRO keeps `medical_records.read.all` and full `patient.*`, but can no longer mutate any medical record.
- **ADMIN** — 9 (unchanged), **PHARMACY** — 3 (unchanged).

### US-17.1 — Doctor lands on a focused workspace

**US-17.1** — As a DOCTOR holding `doctor_workspace.read.own`, I want a
dedicated `/workspace` page listing my visits — upcoming ones first,
past ones below — so that I can pick the next visit and review recent
ones without filtering the generic `/appointments` list.

**Acceptance criteria:**

- `/workspace` is rendered by the doctor's app shell. The sidebar
  exposes a "Workspace" nav item whose visibility is gated on
  `doctor_workspace.read.own` (NURSE / MRO / PHARMACY / ADMIN do not
  see it).
- The page renders **two sections**:
  - **Upcoming** — `GET /appointments?status=BOOKED&from=<today>&order=asc&doctorId=<caller.doctor.id>`.
  - **History** — `COMPLETED` + `CANCELLED` visits, `order=desc`.
    Because the BE list endpoint filters a single `status` at a time,
    the FE issues two parallel calls (one per status) and merges +
    sorts them by `startAt` descending. Each section paginates
    independently via its own query param (`upcomingPage` /
    `historyPage`).
  - The BE narrows by `appointment.read.own` scope; **no new list
    endpoint is introduced** for the workspace queue.
- Rows reuse the shared `AppointmentListRow` component: patient full
  name (linked) + HN, start–end time, doctor · department, and
  type + status chips. Row navigation is the patient-name link plus a
  right-edge **arrow icon button** — the date/time itself is NOT a
  link. Each row links to **`/workspace/:id`** (not `/appointments/:id`).
- Pagination, locale, and "today" boundaries follow the existing
  `/appointments` conventions.
- A DOCTOR direct-loading `/workspace` without `doctor_workspace.read.own`
  hits the page guard and is shown the generic forbidden card; a
  non-DOCTOR hitting the URL gets the same forbidden experience.

### US-17.2 — Doctor sees the visit thread + patient panel

**US-17.2** — As the appointment's doctor opening `/workspace/:id`,
I want to see the patient demographics, the appointment metadata, and
the **medical records for the case**, so that I have the visit's
clinical context without paging through prior appointments.

**Acceptance criteria:**

- `/workspace/:id` is gated on `doctor_workspace.read.own` AND verifies
  `me.doctor?.id === appointment.doctorId`; a caller who isn't this
  appointment's doctor (or lacks the permission) gets the generic
  not-found / forbidden card (no existence leak).
- The page renders, below a "Back to workspace" button and the
  appointment summary card:
  1. **Patient panel** — name (en + th when present), HN, DOB,
     gender, blood group, phone, emergency contact triplet, address.
     The full patient row is fetched via the new **`GET /patients/:id`**
     endpoint (added in this feature — gated on `patient.read`,
     returns `404 PATIENT_NOT_FOUND` for unknown / soft-deleted ids).
  2. **Medical-records history** — `MedicalRecord` rows rendered
     read-only, each card showing the **authoring doctor (name +
     `doctorCode`) + department**, the visit number, the timestamp,
     the note, and the drug. Two fetch modes:
     - Grouped visit → every record in the case via
       `GET /medical-records?appointmentGroupId=<id>&pageSize=all`
       (this feature adds the `appointmentGroupId` query filter).
     - Standalone past visit (no group) → this appointment's own
       record via `GET /medical-records?appointmentId=<id>&pageSize=all`,
       so a completed one-off visit still surfaces its note.
     The section renders whenever the visit is grouped OR is a past
     (non-`BOOKED`) visit; a `BOOKED` standalone visit has no record
     yet, so it is omitted there.
  3. **Note panel** — see US-17.3. Rendered **only while `BOOKED`**;
     `COMPLETED` / `CANCELLED` visits show a read-only status alert and
     the records history with no action panel.
- `/appointments/:id` is unchanged from F09 for every role (NURSE /
  MRO / PHARMACY / DOCTOR alike): the plain read-only detail card, no
  doctor panels, no end-of-visit buttons — cancel only. The F09
  Complete / Refer / Close-Case buttons were removed from it; those
  actions live exclusively in the workspace detail's note panel.

### US-17.3 — Doctor writes a note that submits with the end-of-visit action

**US-17.3** — As the appointment's doctor, I want a single note +
drug input on the workspace detail page whose contents submit **along
with whichever end-of-visit action I take**, so that I can never finish
a visit without leaving a clinical record.

**Acceptance criteria:**

- The note panel renders a required textarea (`note`) and an optional
  textarea (`drug`). Until `note` is non-empty, all three action
  buttons (Complete / Follow Up / Refer) are disabled at the FE.
- Submitting any action passes `{ note, drug? }` to the BE; the BE
  validates `note` as `@IsNotEmpty() @IsString()` and returns
  `400 VALIDATION_FAILED` on an empty body. The same DTO shape is
  shared by the three endpoints (Complete / Refer / Follow Up).
- The BE creates the `MedicalRecord` row in the **same transaction**
  as the appointment state transition — the row carries:
  `{ appointmentId, doctorId, patientId, departmentId, note, drug? }`,
  with `departmentId` denormalised from the appointment (mirrors F08).
- A duplicate workspace action on the same appointment returns
  `409 MEDICAL_RECORD_ALREADY_EXISTS` (the existing
  `medical_records.appointment_id @unique` invariant). The FE
  prevents this by hiding the action panel once the appointment is no
  longer `BOOKED`.

### US-17.4 — Doctor completes the visit (closes the case)

**US-17.4** — As the appointment's doctor, I want a single
**Complete** action that ends the visit AND closes the appointment
group, so that finishing a one-shot visit takes one click instead of
two (the legacy F14 split of Complete vs. Close Case is gone).

**Acceptance criteria:**

- `POST /appointments/:id/complete` accepts `{ note: string, drug?: string }`.
- Gate: `appointment.update.own`. Caller must be the appointment's
  doctor (existing scope rule) — non-doctor of-the-row callers get
  `403 INSUFFICIENT_PERMISSION_SCOPE`.
- Inside a `$transaction(Serializable)` with single retry on `40001`,
  the BE:
  1. Validates the appointment is currently `BOOKED`; otherwise
     returns `409 APPOINTMENT_NOT_BOOKED` (or
     `APPOINTMENT_ALREADY_COMPLETED` / `APPOINTMENT_ALREADY_CANCELLED`
     to match F14 messaging).
  2. Inserts a `MedicalRecord` row (US-17.3 contract).
  3. Updates the appointment: `status = COMPLETED`, `completedAt = now`,
     `updatedBy = caller.userId`.
  4. If `appointment.appointmentGroupId !== null`, updates the group:
     `closedAt = now`, `updatedBy = caller.userId`. If null, the group
     update step is skipped (standalone visit).
- The legacy `POST /appointment-groups/:id/close` endpoint is removed
  in this feature — Complete now does its job. Existing callers (FE
  Close Case button) are removed alongside.

### US-17.5 — Doctor books an in-thread follow-up

**US-17.5** — As the appointment's doctor, I want a **Follow Up**
action that ends this visit AND books the next FOLLOW_UP appointment
inside the same appointment group in one atomic step, so that I never
end up with a `COMPLETED` appointment and no booked continuation
(or vice versa).

**Acceptance criteria:**

- `POST /appointments/:id/follow-up` accepts
  `{ startAt: string, note: string, drug?: string }`. `startAt` is an
  ISO UTC datetime (the slot the doctor picked in the dialog).
- Gate: `appointment.update.own`. Caller must be the appointment's
  doctor.
- Inside a `$transaction(Serializable)` with single retry on `40001`,
  the BE:
  1. Validates the current appointment is `BOOKED` (same shape as
     US-17.4).
  2. Inserts a `MedicalRecord` row for the current appointment
     (US-17.3 contract).
  3. Marks the current appointment `status = COMPLETED`, `completedAt = now`.
  4. Creates a new appointment with:
     - `patientId`, `doctorId`, `departmentId` copied from the current
       appointment;
     - `appointmentType = FOLLOW_UP`;
     - `startAt = body.startAt`, `endAt = startAt + durationMinutes`
       (durationMinutes from `(departmentId, FOLLOW_UP)` row per F13);
     - `scheduleId` resolved by finding the doctor's
       `DoctorSchedule` covering `startAt`;
     - `previousAppointmentId = <current appointment id>` — F14's
       lazy group materialisation slots this into the same group and
       sets `visitNumber`.
  5. Returns the **new** follow-up appointment in the response body.
- Slot conflicts, `(departmentId, FOLLOW_UP)` validation, and booking
  window enforcement (F13) all reuse the existing
  `AppointmentsService.create` logic — no duplicated rules.
- The FE dialog drives the flow: date picker → fetch
  `GET /slots?doctorId=&departmentId=&date=&type=FOLLOW_UP` → slot
  grid → Confirm. The doctor cannot submit until both `note` is
  non-empty and a slot is selected.
- F16 invariant preserved: `previousAppointmentId` is set, so the
  standalone-type guard (which would reject FOLLOW_UP without a
  previous) does not fire.

### US-17.6 — Doctor refers to another department

**US-17.6** — As the appointment's doctor, I want **Refer** to keep
its F14 shape (complete current + flag referral, group stays open)
while also absorbing the note + drug fields, so that the referring
doctor's clinical reasoning is captured in the visit record as part
of the same action.

**Acceptance criteria:**

- `POST /appointments/:id/refer` body becomes
  `{ referredToDepartmentId: string, note: string, drug?: string }`
  (the previous body's `note`-less shape is retired in this feature).
- Gate: `appointment.update.own`. Same scope rule as F14.
- Inside the existing F14 transaction, the BE additionally inserts a
  `MedicalRecord` row (US-17.3 contract) before stamping
  `referredToDepartmentId` + `referredAt` on the row and transitioning
  to `COMPLETED`.
- All existing F14 invariants are preserved: `referredToDepartmentId`
  cannot equal the appointment's own `departmentId`; the group is
  **not** closed (destination NURSE picks up via the pending-referral
  queue); the referral remains unfulfilled until a subsequent
  continuation is booked.

---

## Constraints reference

DB-level CHECK constraints, all appended as raw SQL to the init migration
`apps/api/prisma/migrations/<timestamp>_init/migration.sql` (Prisma 5
cannot express CHECK constraints natively). The application layer mirrors
these in DTO validation for fast user feedback; the DB is the back-stop.

| Constraint                            | Table              | SQL                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patients_hn_format`                  | `patients`         | `CHECK ("hn" ~ '^[0-9]{7,9}$')`                                                                                                                                                                                                                                                                                  |
| `doctor_schedules_end_after_start`    | `doctor_schedules` | `CHECK ("end_at" > "start_at")`                                                                                                                                                                                                                                                                                  |
| `doctor_schedules_break_valid`        | `doctor_schedules` | `CHECK (("break_start_at" IS NULL AND "break_end_at" IS NULL) OR ("break_start_at" IS NOT NULL AND "break_end_at" IS NOT NULL AND "break_start_at" >= "start_at" AND "break_end_at" <= "end_at" AND "break_start_at" < "break_end_at"))`                                                                          |
| `appointments_end_after_start`        | `appointments`     | `CHECK ("end_at" > "start_at")`                                                                                                                                                                                                                                                                                  |

**Migration regen flow** (when the schema changes during development):
1. Drop the local Postgres schema.
2. Delete the `apps/api/prisma/migrations/<timestamp>_init/` folder.
3. `pnpm --filter @his/api prisma migrate dev --name init` (regenerates the migration without the CHECKs).
4. **Append the 4 CHECK constraints to the bottom of the new `migration.sql`.**
5. `pnpm --filter @his/api prisma migrate reset` (applies + reseeds).
