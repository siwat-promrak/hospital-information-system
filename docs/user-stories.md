# Hospital Information System — User Stories

Appointment Booking module, P0 + P1 scope.

This document groups stories by epic (E1–E12). Each epic maps to one or more
features in `feature-roadmap.md`. Story IDs are stable: when a story is
implemented, reference its ID in commit messages and PR descriptions.

> **Out of scope per the spec interpretation locked in 2026-05-24:** patients
> do NOT sign in to this system. They are pure records managed by STAFF /
> ADMIN. The previously-considered patient self-service epics (view / cancel
> / book own appointments) have been removed entirely. The `Role` enum has
> also been removed; roles are now DB rows in the `roles` table with
> permissions granted via `policies`.

Roles used in this document (DB rows in the `roles` table — the `Role` enum
is gone):

- **PATIENT** — **out of scope.** Patients do NOT sign in to this system;
  they are pure records managed by STAFF / ADMIN (no `User` link).
- **STAFF** — clinic-side operator (receptionist / coordinator). Pre-created
  by an ADMIN. Holds all 11 operational permissions: book / cancel / list /
  read appointments (4), manage doctor schedules (`schedule.manage`),
  register / read / update / list patients (4), and view doctors
  (`doctor.read`, `doctor.list`). Cannot manage users or assign
  permissions. **Ownership filtering is NOT in P0** — every STAFF can act
  on every patient (no per-staff patient assignment).
- **ADMIN** — **narrowed to user/role/policy management ONLY** (5
  permissions): `user.invite`, `user.disable`, `user.list`, `role.manage`,
  `permission.assign`. Clinic operations (appointment.*, patient.*,
  doctor.*, schedule.manage) are **NOT granted by default**; ADMIN can
  grant them to themselves or others at runtime via `permission.assign`
  (US-11.5).
- **DOCTOR** — **NOT data-only anymore.** Holds ONE permission:
  `schedule.manage` (coarse). A `User` with `role.code = DOCTOR` always
  has a linked `Doctor` row (1:1) and is affiliated with one or more
  `Department`s via the `doctor_departments` join. **Service-layer scope
  rule:** when the caller is DOCTOR, the schedule CRUD service MUST
  restrict mutations to `schedule.doctorId === caller.doctor.id`. STAFF
  gets the unrestricted form of the same permission. DOCTOR has no other
  UI surface in P0 — the doctor portal is the schedule editor only.

Conventions:

- "Slot" = a discrete bookable time window on a doctor's schedule, computed
  from `(DoctorSchedule, AppointmentType.durationMinutes)`.
- Slot grid step equals the chosen appointment type's duration (e.g. a 20-min
  consultation yields 09:00, 09:20, 09:40, …).
- All schedule times are stored as `startMinute: Int` (minutes since midnight,
  clinic-local).
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
  permission codes. The Nest guard loads `user.role.policies[].permission.code`
  once per request via Prisma (cached on the request context) and checks
  the required permission against that set. The `Role` Prisma enum is gone:
  roles are now DB rows (`roles` table), permissions are code-defined
  (canonical list of 16 in `apps/api/prisma/seed/permissions.ts`), and
  admins attach permissions to roles at runtime via the `permission.assign`
  capability (US-11.5). Seeded baseline: ADMIN→5, STAFF→11, DOCTOR→1
  (`schedule.manage`, with app-layer own-doctor scope restriction).
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

---

## E1 — Database foundation

Purely infrastructural epic. No user-facing stories, but the data model is
documented here so all downstream stories are grounded.

### Data model (P0) — 12 tables

| Model                         | Purpose                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                       | Auth principal. Multilingual names (`firstNameEn`/`lastNameEn` required, `firstNameTh`/`lastNameTh` nullable). `email` is unique + lowercased; `googleSub?`; `roleId?` (nullable **only** to permit the bootstrap super-admin insert); soft-delete via `deletedAt` / `deletedBy`. **No patient link** — patients do not sign in. |
| `patients`                    | Pure record (no `User` link). Multilingual names (en required, th nullable); `hn @db.VarChar(9)` with CHECK `^[0-9]{7,9}$`; `identificationNo` (Thai national ID or passport, freeform); `email?` (unique, lowercased); phone; date of birth; gender; blood group (default `UNKNOWN`); emergency-contact triplet; address. |
| `departments`                 | Clinic department (`name` unique, `description?`). Soft-delete supported.                                                                                                                            |
| `department_appointment_types`| Per-department allowed `AppointmentType` set (the "department booking rules" from the spec). Unique on `(departmentId, appointmentType)`. Booking validation MUST check the pair exists here.        |
| `doctors`                     | Practitioner. 1-1 link to a `User` (`role.code = DOCTOR`). Carries `doctorCode` (unique), `medicalLicenseNo` (unique), `identificationNo` (required, freeform — parity with Patient). **No `departmentId` column** — affiliation lives in `doctor_departments`. |
| `doctor_departments`          | M:N join between `doctors` and `departments`. Each row carries `isPrimary: Boolean default false`; application layer enforces "at most one primary per doctor" (no DB constraint). Unique on `(doctorId, departmentId)`. |
| `doctor_schedules`            | Weekly recurring availability with `doctorId`, `departmentId` (which department this schedule is for — required, since doctors may span departments), `dayOfWeek`, `startMinute` / `endMinute` (CHECK-validated), optional `breakStartMinute` / `breakEndMinute` (CHECK-validated), `acceptsBooking` flag, `effectiveFrom`, `effectiveUntil?`. Indexed on `(doctorId, departmentId)`. |
| `appointments`                | `patientId`, `doctorId`, `departmentId` (inherited from the chosen schedule), `appointmentType`, `status`, `startAt` / `endAt` (CHECK `end > start`), `reason?` (Postgres `text`, no length cap), `createdBy` (renamed from `createdByUserId`), `updatedBy?`, `cancelledBy?` (renamed from `cancelledByUserId`) / `cancelledAt?` / `cancellationReason?`, `completedAt?`. **No `deletedAt` / `deletedBy`** — uses `status=CANCELLED` instead. |
| `roles`                       | RBAC role (`code` unique). Seeded with `ADMIN`, `STAFF`, `DOCTOR`; admins holding `role.manage` may add custom roles at runtime.                                                                     |
| `permissions`                 | Atomic capability with a stable `code`. **Code-defined**: seeded from a canonical list in `apps/api/prisma/seed/permissions.ts`; adding a new permission requires a code change + migration.         |
| `policies`                    | `(roleId, permissionId)` join — "role R has permission P". Unique on the pair. Granted / revoked at runtime by admins holding `permission.assign`.                                                   |

There is **no `staff_domains` table** — the staff/admin email-domain
allowlist is env-driven via `STAFF_ALLOWED_DOMAINS`.

Enums (Prisma): `AppointmentStatus` (`BOOKED`, `CANCELLED`, `COMPLETED`),
`AppointmentType` (`NEW_PATIENT_VISIT`, `FOLLOW_UP`, `CONSULTATION`,
`PROCEDURE`), `DayOfWeek` (`SUN`…`SAT`), `Gender` (`MALE`, `FEMALE`),
`BloodGroup` (8 ABO/Rh combinations + `UNKNOWN`). The `Role` enum is GONE
(roles are now a table). `AppointmentType` is a Prisma enum on the
`appointments` and `department_appointment_types` tables; the per-type
duration map (NEW_PATIENT_VISIT=30, FOLLOW_UP=15, CONSULTATION=20,
PROCEDURE=60) still lives in application code — no separate table in P0.

### Permission catalog (P0)

The **16** canonical permission codes seeded into `permissions`:

| Code                  | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `appointment.create`  | Create new appointments for any patient                  |
| `appointment.cancel`  | Cancel any appointment                                   |
| `appointment.list`    | List all appointments with filters                       |
| `appointment.read`    | View an appointment's detail                             |
| `schedule.manage`     | Create / update / delete doctor schedules                |
| `patient.create`      | Register new patients (walk-in)                          |
| `patient.read`        | View patient details                                     |
| `patient.update`      | Edit patient demographics                                |
| `patient.list`        | List all patients                                        |
| `doctor.read`         | View doctor details                                      |
| `doctor.list`         | List doctors and departments                             |
| `user.invite`         | Pre-create a User row by email + role                    |
| `user.disable`        | Soft-delete a User (block sign-in)                       |
| `user.list`           | List all Users                                           |
| `role.manage`         | Create / update / delete / list roles                    |
| `permission.assign`   | Create / delete policies (assign permissions to roles)   |

Default policy grants — **17 rows total** (5 + 11 + 1):

- **ADMIN** → **5** permissions (narrowed to user/role/policy management):
  `user.invite`, `user.disable`, `user.list`, `role.manage`,
  `permission.assign`. Clinic operations (appointment.*, patient.*,
  doctor.*, schedule.manage) are NOT granted by default; ADMIN can grant
  them at runtime via `permission.assign`.
- **STAFF** → **11** permissions: `appointment.create` / `.cancel` /
  `.list` / `.read` (4), `schedule.manage` (1), `patient.create` /
  `.read` / `.update` / `.list` (4), `doctor.read` / `doctor.list` (2).
- **DOCTOR** → **1** permission: `schedule.manage` (coarse). The schedule
  CRUD service MUST enforce app-layer own-doctor scope when
  `caller.role === DOCTOR` — restrict mutations to `schedule.doctorId ===
  caller.doctor.id`. STAFF gets the unrestricted form of the same
  permission.

### Constraints enforced at DB level

Four raw-SQL CHECK constraints are appended to the init migration (Prisma
5 cannot express CHECK natively). See the **Constraints reference** at the
end of this document for SQL.

1. `patients_hn_format` — `hn ~ '^[0-9]{7,9}$'`.
2. `doctor_schedules_window_valid` — `0 <= start_minute < end_minute <=
   1440`.
3. `doctor_schedules_break_valid` — if break minutes set, both must be
   set and the break window must lie inside the working window with
   `break_start < break_end`.
4. `appointments_end_after_start` — `end_at > start_at`.

### Notes / assumptions

- Role + Permission + Policy are seeded by `apps/api/prisma/seed/{roles,permissions,policies}.ts`. The full permission catalog is canonical — adding a new permission requires a code change + migration.
- The super-admin user is bootstrapped at the nil UUID (`00000000-0000-0000-0000-000000000000`) with `role_id = NULL` so the chicken-and-egg `roles.created_by` / `users.role_id` cycle can resolve (Option C bootstrap). Its `role_id` is back-filled to ADMIN immediately after roles are seeded.
- `User.role_id` is nullable **only** to permit the bootstrap insert; every non-bootstrap user MUST have a non-null `role_id` (enforced at the API DTO layer).
- Soft-delete is supported on every table (full audit cluster `deletedAt` / `deletedBy`) **except** `appointments`, which uses the `status=CANCELLED` transition instead.
- All timestamps stored as `timestamptz(3)` (UTC), rendered clinic-local in UI.
- Doctor↔Department is M:N (`doctor_departments`). Each `DoctorSchedule` pins the specific `departmentId` it applies to; the booking flow inherits `Appointment.departmentId` from the chosen schedule (not from the doctor).

### Seeded data (development)

The dev seed orchestrator (`apps/api/prisma/seed/index.ts`) produces a
stable, idempotent baseline. **No DOCTOR users, doctors, doctor schedules,
or appointments are seeded** — those are created via application
workflows (admin invite + schedule editor + booking) in later features.

- **3 roles** — `ADMIN`, `STAFF`, `DOCTOR`.
- **16 permissions** — the canonical catalog above.
- **17 policies** — 5 + 11 + 1 as listed above.
- **5 users** — 1 super-admin (nil UUID) + 2 ADMIN
  (`admin1@gmail.com`, `admin2@gmail.com`) + 2 STAFF
  (`staff1@gmail.com`, `staff2@gmail.com`).
- **10 departments** — Cardiology, Internal Medicine, Pediatrics,
  Orthopedics, Obstetrics & Gynecology, Dermatology, Ophthalmology,
  Otolaryngology (ENT), General Surgery, Emergency Medicine.
- **35 `department_appointment_types`** — per-department allowed-type
  matrix.
- **10 patients** — HN `26000001`…`26000010`, emails
  `patient1@mailsac.com`…`patient10@mailsac.com`, multilingual names mix
  (about half have Thai names), 5 MALE + 5 FEMALE, blood-group mix
  including `UNKNOWN`.

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
- Triggering sign-out clears the session cookie and redirects to `/signin`.
- After sign-out, accessing a protected route redirects back to `/signin`.

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

---

## E3 — Role resolution & onboarding

Patient sign-in has been removed from scope (see top callout). The
onboarding epic is now reduced to staff/admin resolution + the home
dispatcher; the previous US-3.2 (patient auto-creation) and US-3.3
(patient onboarding form) are gone.

### US-3.1 — Staff/Admin/Doctor resolution on first sign-in

**US-3.1** — As a STAFF, ADMIN, or DOCTOR whose account was pre-created by
an ADMIN, I want my Google sign-in to resolve to my existing `User` record,
so that I land in the right workspace immediately.

**Acceptance criteria:**

- NextAuth `signIn` callback calls backend `POST /auth/resolve` with the
  Google profile (email, sub, name, picture), guarded by the
  `INTERNAL_API_SECRET` header.
- Backend **lowercases** the incoming email via `normalizeEmail()` before
  any lookup.
- Backend matches an existing `User` by the normalized `email` whose
  `role.code IN ('ADMIN', 'STAFF', 'DOCTOR')` and whose
  `disabledAt IS NULL`. **All three roles are sign-in-able** — DOCTOR is
  no longer a no-op role (it now holds `schedule.manage` for its own
  schedule).
- The domain allowlist (`STAFF_ALLOWED_DOMAINS`) governs which email
  domains may sign in at all; emails outside the allowlist that don't
  match any pre-created `User` are rejected with `code=NOT_INVITED`
  (there is no patient fallback).
- On match, backend sets `googleSub` if previously null and returns
  `{ userId, roleCode, permissionCodes[] }` (the permission list is loaded
  from `user.role.policies[].permission.code`).
- Resolved role and permissions are encoded in the JWT and used by the
  home dispatcher and per-request permission guard.

**Notes / assumptions:** Staff and admins are created via E11
(`user.invite`); this story assumes the `User` row already exists. DOCTOR
users are created alongside their `Doctor` clinical record (and their
`doctor_departments` rows) via the admin invite flow — the take-home
does not seed any DOCTOR rows.

### US-3.4 — Home dispatcher routes by role

**US-3.4** — As a signed-in user, I want the root path to take me to the
right workspace, so that I don't have to remember role-specific URLs.

**Acceptance criteria:**

- `GET /[locale]` reads the session role code:
  - `ADMIN` → renders the admin dashboard (user / role / policy
    management).
  - `STAFF` → renders the clinic dashboard
    (appointments / patients / schedules).
  - `DOCTOR` → renders the doctor schedule editor for their own
    schedule (the only doctor-facing UI in P0).
  - Unauthenticated → server-side redirect to `/signin`.
- There is no PATIENT branch — patients cannot authenticate.

---

## E4 — Doctor & Department directory

### US-4.1 — List departments

**US-4.1** — As a STAFF user, I want to see all departments, so that I can
filter doctors by specialty.

**Acceptance criteria:**

- `GET /departments` returns `[{ id, name, description? }]` ordered by
  `name`.
- Endpoint requires the `doctor.list` permission. **STAFF holds it by
  default; ADMIN does not** (clinic operations are not in ADMIN's seeded
  baseline). DOCTOR also lacks it; callers without the permission receive
  `403 INSUFFICIENT_PERMISSION`.
- Department list page renders the result with localized labels.

### US-4.2 — List doctors (optionally filtered by department)

**US-4.2** — As a STAFF user, I want to browse doctors, so that I can pick
one to book with.

**Acceptance criteria:**

- `GET /doctors?departmentId=:id?` returns
  `[{ id, firstNameEn, lastNameEn, firstNameTh?, lastNameTh?, doctorCode, departments: [{ id, name, isPrimary }] }]`.
  Doctors may appear with multiple departments since `doctor_departments`
  is M:N.
- Without the query param, returns all doctors ordered by primary
  department then surname. With `departmentId`, returns doctors who have
  any `doctor_departments` row for that department (regardless of
  `isPrimary`).
- Endpoint requires the `doctor.list` permission (STAFF only by default).
- A `/doctors` page shows the list with a department filter dropdown.
- A companion `GET /departments/:id/doctors` returns the doctors
  affiliated with a single department.

### US-4.3 — View doctor detail

**US-4.3** — As a STAFF user, I want to view a doctor's profile, so that I
can see their department affiliations and upcoming availability summary.

**Acceptance criteria:**

- `GET /doctors/:id` returns the doctor record (incl. `doctorCode`,
  `medicalLicenseNo`, `identificationNo`, `gender?`, `phone`,
  `address?`), the list of `doctor_departments` affiliations with
  `isPrimary` flags, and a thin schedule summary (e.g. days of the week
  per department where the doctor has any schedule).
- Endpoint requires the `doctor.read` permission (STAFF only by default).
- `404` with `code=DOCTOR_NOT_FOUND` if the doctor does not exist.
- A `/doctors/:id` page renders the detail and offers a "Book appointment"
  CTA (gated on the caller also holding `appointment.create`).

---

## E5 — Doctor Schedule management

All endpoints in this epic require the `schedule.manage` permission.
**STAFF and DOCTOR** both hold it by default; ADMIN does NOT (ADMIN may
grant it to themselves via `permission.assign` if needed).

**Scope rule (app-layer, NOT in the DB):** when the caller is DOCTOR, the
service MUST restrict every mutation and read to schedules where
`schedule.doctorId === caller.doctor.id` — DOCTOR cannot view or edit
another doctor's schedule. STAFF gets the unrestricted form of the same
permission. Calls that violate this scope return `403` with
`code=INSUFFICIENT_PERMISSION_SCOPE`.

**Department coupling:** each `DoctorSchedule` row carries a required
`departmentId`. The chosen department MUST appear in the doctor's
`doctor_departments` affiliations; otherwise the create / update returns
`code=DOCTOR_NOT_IN_DEPARTMENT`.

**DB-level CHECK constraints back-stop the validation:**
`doctor_schedules_window_valid` enforces window math and
`doctor_schedules_break_valid` enforces break-window math (see the
Constraints reference). DTOs mirror these checks for fast user feedback.

### US-5.1 — Lists schedules for a doctor

**US-5.1** — As a user with `schedule.manage`, I want to view all schedule
rows for a chosen doctor, so that I can see and manage their weekly
availability.

**Acceptance criteria:**

- `GET /doctors/:id/schedules` returns
  `[{ id, departmentId, dayOfWeek, startMinute, endMinute, breakStartMinute?, breakEndMinute?, acceptsBooking, effectiveFrom, effectiveUntil? }]`
  ordered by `(effectiveFrom DESC, dayOfWeek ASC, startMinute ASC)`.
- Endpoint requires the `schedule.manage` permission; callers without it
  receive `403 INSUFFICIENT_PERMISSION`.
- **DOCTOR scope:** if `caller.role === DOCTOR`, the response is
  restricted to schedules where `doctorId === caller.doctor.id`;
  requesting another doctor's schedules returns
  `403 INSUFFICIENT_PERMISSION_SCOPE`.
- The UI page lists schedules grouped by day-of-week with localized
  weekday labels, with the per-row `departmentId` rendered as the
  department name.

### US-5.2 — Creates a schedule

**US-5.2** — As a user with `schedule.manage`, I want to add a new weekly
recurring schedule for a doctor, so that the slot finder can offer their
availability.

**Acceptance criteria:**

- `POST /doctors/:id/schedules` accepts
  `{ departmentId, dayOfWeek (0–6), startMinute, endMinute, breakStartMinute?, breakEndMinute?, acceptsBooking?, effectiveFrom, effectiveUntil? }`.
- Validation: `0 <= startMinute < endMinute <= 1440`, break window (if
  set) lies fully inside `(startMinute, endMinute)` with
  `breakStart < breakEnd`, `effectiveFrom <= effectiveUntil` when both
  set. These DTO checks mirror the DB CHECK constraints.
- `departmentId` must be one of the doctor's affiliations
  (`doctor_departments`); otherwise reject with
  `code=DOCTOR_NOT_IN_DEPARTMENT`.
- Backend rejects schedules that overlap an existing active schedule for
  the same `(doctor, dayOfWeek)` within their effective windows
  (`code=SCHEDULE_OVERLAP`).
- Endpoint requires the `schedule.manage` permission.
- **DOCTOR scope:** if `caller.role === DOCTOR`, `:id` MUST equal
  `caller.doctor.id`; else `403 INSUFFICIENT_PERMISSION_SCOPE`.
- The UI exposes a "Add schedule" dialog using MUI date pickers, a
  weekday selector, and a department selector populated from the doctor's
  affiliations.

### US-5.3 — Edits a schedule

**US-5.3** — As a user with `schedule.manage`, I want to edit an existing
schedule, so that I can correct mistakes or change hours.

**Acceptance criteria:**

- `PATCH /doctors/:doctorId/schedules/:scheduleId` accepts a partial of
  the create payload (including `departmentId`).
- Same window / break / department / overlap validation as US-5.2.
- Endpoint requires the `schedule.manage` permission.
- **DOCTOR scope:** if `caller.role === DOCTOR`, the schedule's
  `doctorId` MUST equal `caller.doctor.id`; else
  `403 INSUFFICIENT_PERMISSION_SCOPE`.
- Editing a schedule does **not** retroactively cancel appointments
  already booked outside the new window — those are flagged in the UI but
  remain `BOOKED`.

### US-5.4 — Deletes a schedule

**US-5.4** — As a user with `schedule.manage`, I want to remove a schedule,
so that the doctor stops being offered for new bookings on that day/time.

**Acceptance criteria:**

- `DELETE /doctors/:doctorId/schedules/:scheduleId` removes the row.
- Endpoint requires the `schedule.manage` permission.
- **DOCTOR scope:** if `caller.role === DOCTOR`, the schedule's
  `doctorId` MUST equal `caller.doctor.id`; else
  `403 INSUFFICIENT_PERMISSION_SCOPE`.
- Deleting a schedule does NOT cancel existing future appointments inside
  that window; the UI surfaces a count of affected future appointments
  before confirming.

---

## E6 — Appointment Types & Slot Finder

### US-6.1 — List appointment types

**US-6.1** — As a STAFF user, I want to see the available appointment
types and their durations, so that I can pick the right one when booking.

**Acceptance criteria:**

- `GET /appointment-types` returns the hardcoded list
  `[{ code, label, durationMinutes }]` for `NEW_PATIENT_VISIT`,
  `FOLLOW_UP`, `CONSULTATION`, `PROCEDURE`.
- Endpoint requires the `appointment.create` permission (the caller is
  about to book) — STAFF only by default. (ADMIN does NOT hold
  `appointment.create` in the seeded baseline; grant it via
  `permission.assign` if an ADMIN must book.)

### US-6.2 — Find available slots

**US-6.2** — As a STAFF user, I want to query open slots for a
`(department, doctor, date, appointmentType)`, so that I can pick a time
that matches the per-department booking rules.

**Acceptance criteria:**

- `GET /doctors/:id/slots?departmentId=:dept&date=YYYY-MM-DD&type=APPOINTMENT_TYPE`
  returns `[{ startAt, endAt, departmentId }]` in chronological order.
- The `departmentId` query param is **required**: the slot finder only
  considers `DoctorSchedule` rows whose `departmentId` matches it (since
  doctors may span multiple departments and each schedule pins one).
- The requested `(departmentId, appointmentType)` pair MUST exist in
  `department_appointment_types`; otherwise the endpoint returns
  `400 DEPARTMENT_TYPE_NOT_ALLOWED`.
- Slots are computed from active `DoctorSchedule` rows for the requested
  weekday + department and stepped by `AppointmentType.durationMinutes`.
  Slots overlapping the schedule's break window are excluded.
- Slots overlapping a `BOOKED` or `COMPLETED` appointment for that doctor
  on that day are excluded.
- Slots that start in the past (relative to clinic-local "now") are
  excluded.
- Returns empty array (not `404`) when no slots are available, **including
  the case of a fully-past `date` parameter** — never `400` (the
  past-date case still returns `200 []`).
- Endpoint requires the `appointment.create` permission (the slot finder
  is adjacent to booking; anyone who can book may probe slots).

**Notes / assumptions:** The slot finder is the single source of truth for
"is this time bookable?"; the booking endpoints re-validate inside a
transaction to defend against races. The slot's `departmentId` flows into
the resulting `Appointment.departmentId` on booking.

---

## E7 — Staff booking on behalf

**STAFF only** by default. ADMIN does NOT hold `appointment.create` /
`patient.list` / `patient.create` in the seeded baseline; an ADMIN who
needs to book must first grant themselves the required permissions via
`permission.assign` (US-11.5). There is **no ownership filter** in P0 —
every STAFF can act on every patient.

### US-7.1 — Staff searches for a patient

**US-7.1** — As a user with `patient.list`, I want to search for any
existing patient by name, identification number, or phone, so that I can
book on their behalf.

**Acceptance criteria:**

- `GET /patients?q=:term` returns up to 20 matches with
  `[{ id, firstNameEn, lastNameEn, firstNameTh?, lastNameTh?, dateOfBirth, phone, hn }]`.
- Search is case-insensitive partial match across name (en + th) / phone
  / identification number / HN.
- Endpoint requires the `patient.list` permission (STAFF only by
  default).
- **No ownership filter** — every match is visible to every authorised
  caller.

### US-7.2 — Staff books an appointment for any patient

**US-7.2** — As a user with `appointment.create`, I want to book an
appointment for a patient on a selected doctor, department, type, and
slot, so that the patient is scheduled.

**Acceptance criteria:**

- `POST /appointments` accepts
  `{ patientId, doctorId, departmentId, appointmentType, startAt, reason? }`.
- The `departmentId` is **inherited from the chosen `DoctorSchedule`**,
  NOT looked up from the doctor (because a doctor may span multiple
  departments). The UI passes back the `departmentId` returned by the
  slot finder.
- The requested `(departmentId, appointmentType)` pair MUST exist in
  `department_appointment_types`; otherwise reject with
  `code=DEPARTMENT_TYPE_NOT_ALLOWED`.
- The chosen `doctorId` MUST have a `doctor_departments` row for
  `departmentId`; otherwise reject with `code=DOCTOR_NOT_IN_DEPARTMENT`.
- `reason` is required iff `appointmentType=PROCEDURE` (conditional zod
  schema and class-validator DTO). Stored as Postgres `text` (no length
  cap).
- Endpoint requires the `appointment.create` permission (STAFF only by
  default).
- Backend runs inside a `$transaction` with isolation `Serializable`,
  retrying once on Postgres error `40001`.
- Transaction verifies the slot is still available against the active
  schedule (filtered by `departmentId`) and existing appointments;
  conflicts return `409` with `code=SLOT_TAKEN`.
- On success, persists `Appointment` with `status=BOOKED`,
  `createdBy=<session.userId>`, `endAt = startAt + duration`. The
  `appointments_end_after_start` DB CHECK back-stops the math.
- Returns the created appointment payload.

### US-7.3 — Staff sees confirmation

**US-7.3** — As a STAFF booker, I want a clear confirmation after booking,
so that I know it succeeded and can share details with the patient.

**Acceptance criteria:**

- After a successful `POST /appointments`, the UI navigates to a detail
  page showing the patient, doctor, department, type, date/time, and
  reason.
- A toast/snackbar confirms creation with a localized message.

### US-7.4 — Staff registers a walk-in patient

**US-7.4** — As a user with `patient.create`, I want to quickly register a
walk-in patient who doesn't yet exist in the system, so that I can book
them without leaving the booking flow.

**Acceptance criteria:**

- `POST /patients` accepts the full demographic payload
  (`{ firstNameEn, lastNameEn, firstNameTh?, lastNameTh?, email?, dateOfBirth, gender, bloodGroup?, identificationNo, phone, emergencyPersonName, emergencyPersonRelation, emergencyPersonPhone, address }`).
- `hn` is assigned by the backend (not in the request payload) and must
  match the CHECK `^[0-9]{7,9}$`.
- `email` (if provided) is lowercased via `normalizeEmail()` and stored
  with the unique constraint.
- Endpoint requires the `patient.create` permission (STAFF only by
  default).
- The created patient row is accessible to every staff/admin caller — no
  per-creator ownership relation is recorded (no `primary_staff_user_id`).
- Returns the created patient; the UI then uses it in the booking wizard.

---

## E8 — Appointment lifecycle (staff)

**STAFF only** by default. ADMIN does NOT hold any `appointment.*`
permission in the seeded baseline; an ADMIN who needs lifecycle access
must first grant the relevant permission(s) via `permission.assign`.

### US-8.1 — Staff lists appointments

**US-8.1** — As a user with `appointment.list`, I want a filterable list of
appointments, so that I can find a specific one to manage.

**Acceptance criteria:**

- `GET /appointments?doctorId=&patientId=&departmentId=&from=&to=&status=`
  returns a paginated list (default 20 per page, max 100).
- Default sort: `startAt ASC` for future, `startAt DESC` for past
  (controlled by `order` query param `asc|desc`).
- Endpoint requires the `appointment.list` permission (STAFF only by
  default).

### US-8.2 — Staff views appointment detail

**US-8.2** — As a user with `appointment.read`, I want to view the full
detail of one appointment, so that I can confirm fields before any change.

**Acceptance criteria:**

- `GET /appointments/:id` returns the appointment with embedded patient,
  doctor, and department (name).
- Endpoint requires the `appointment.read` permission (STAFF only by
  default).
- `404` with `code=APPOINTMENT_NOT_FOUND` for missing IDs.

### US-8.3 — Staff cancels an appointment

**US-8.3** — As a user with `appointment.cancel`, I want to cancel any
appointment, so that the slot becomes free for reuse.

**Acceptance criteria:**

- `POST /appointments/:id/cancel` sets `status=CANCELLED`,
  `cancelledBy=<session.userId>`, `cancelledAt=now`, and optional
  `cancellationReason` from the request body.
- Endpoint requires the `appointment.cancel` permission (STAFF only by
  default).
- Cancelling an already-cancelled appointment returns `409` with
  `code=APPOINTMENT_ALREADY_CANCELLED`.
- After cancellation, the slot is immediately available to other bookings
  (verified by re-running US-6.2). Appointments do NOT carry
  `deletedAt` / `deletedBy` — `status=CANCELLED` replaces soft-delete.
- UI shows a confirm dialog before calling the endpoint.

---

## E11 — Admin user management (P1)

ADMIN-only operations to invite, list, and disable other users, plus
runtime role / permission management via the `permission.assign`
capability.

### US-11.1 — Admin invites a STAFF, ADMIN, or DOCTOR user

**US-11.1** — As an ADMIN, I want to pre-create a STAFF, ADMIN, or DOCTOR
`User` by email and role, so that they can sign in via Google immediately.

**Acceptance criteria:**

- `POST /admin/users` accepts
  `{ email, roleCode ('ADMIN' | 'STAFF' | 'DOCTOR'), firstNameEn, lastNameEn, firstNameTh?, lastNameTh?, doctor? }`.
- For `roleCode = 'DOCTOR'`, the request MUST include a `doctor`
  sub-object carrying `{ doctorCode, medicalLicenseNo, identificationNo, gender?, phone, address?, departmentIds: string[] (>= 1), primaryDepartmentId? }`.
  The backend transactionally creates the `User`, the `Doctor` (1-1), and
  one `doctor_departments` row per `departmentIds` entry, marking
  `primaryDepartmentId` as `isPrimary = true` (defaults to the first if
  unspecified). Application layer enforces "at most one primary per
  doctor".
- Endpoint requires the `user.invite` permission (ADMIN only by default).
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
  `[{ id, email, firstNameEn, lastNameEn, firstNameTh?, lastNameTh?, roleCode, deletedAt, createdAt }]`.
- Default returns active users only (`deletedAt IS NULL`); pass
  `disabled=true` to include soft-deleted.
- Endpoint requires the `user.list` permission (ADMIN only by default).

### US-11.3 — Admin soft-revokes a user

**US-11.3** — As an ADMIN, I want to disable another user account, so that
they can no longer sign in while preserving their audit trail.

**Acceptance criteria:**

- `POST /admin/users/:id/disable` sets `deletedAt = now` and
  `deletedBy = <session.userId>` on the `users` row (the user's "disabled"
  state is its soft-delete cluster).
- Endpoint requires the `user.disable` permission (ADMIN only by default).
- Disabled users fail `/auth/resolve` (returns `code=USER_DISABLED`);
  their existing `Appointment.createdBy` / `cancelledBy` references
  remain intact (audit FKs use `ON DELETE NO ACTION`).
- ADMIN cannot disable their own account (`code=CANNOT_DISABLE_SELF`).
- A reactivation endpoint `POST /admin/users/:id/enable` clears
  `deletedAt` / `deletedBy`.

### US-11.5 — Admin assigns permissions to roles

**US-11.5** — As an ADMIN, I want to grant or revoke specific permissions
on a role, so that I can tune what STAFF (or future custom roles) — or
even ADMIN itself — can do without code changes.

**Acceptance criteria:**

- `POST /admin/roles/:id/policies` accepts `{ permissionId }` and creates a
  new `Policy` row linking the role to the permission. Idempotent: a
  duplicate grant returns the existing policy (or `409 POLICY_EXISTS` —
  either is acceptable for v1).
- `DELETE /admin/roles/:id/policies/:permissionId` removes the policy
  (soft-delete via `deletedAt` / `deletedBy`).
- Endpoint requires the `permission.assign` permission (ADMIN only by
  default).
- ADMIN can use this endpoint to grant themselves clinic-operations
  permissions (e.g. `appointment.create`) that are NOT in the seeded
  baseline. This is the canonical path for an ADMIN who needs to act as
  a booker.
- **Lockout guard:** revoking `permission.assign` from the ADMIN role is
  rejected with `code=CANNOT_REMOVE_LAST_PERMISSION_ASSIGN` whenever doing
  so would leave zero active users able to manage policies. (Simplest v1:
  reject the revoke if the target role is ADMIN and the permission is
  `permission.assign`.)
- After a grant/revoke, the per-request permission cache is invalidated on
  the next call from any affected user — practically this means the user's
  permission set is re-read on each request anyway, so no explicit
  invalidation is required.

**Notes / assumptions:** The seeded baseline (ADMIN→5, STAFF→11,
DOCTOR→1) is the starting point. Admins may grant additional permissions
to ADMIN / STAFF / DOCTOR (or any custom role) via this endpoint.

### US-11.6 — Admin creates a custom role (P2)

**US-11.6** — As an ADMIN, I want to create a new role (e.g. "Receptionist
Lead") and assign permissions to it, so that I can introduce role
variations without a schema change.

**Acceptance criteria:**

- `POST /admin/roles` accepts `{ code, name, description? }` and creates a
  new `Role` row (`code` is unique and conventionally UPPER_SNAKE).
- Endpoint requires the `role.manage` permission (ADMIN only by default
  via the seeded baseline).
- Returns the new role; the admin then attaches policies via US-11.5
  (which requires `permission.assign`).
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
- Documents the seeded admin and staff emails for sign-in
  (`admin1@gmail.com`, `admin2@gmail.com`, `staff1@gmail.com`,
  `staff2@gmail.com`; patients do not sign in; no DOCTOR users are
  seeded — they are created via admin invite).
- Documents how to verify the RBAC baseline (seeded roles, 16
  permissions, and 17 policies — ADMIN→5, STAFF→11, DOCTOR→1).
- Links to Swagger at `/api/v1/docs` and to the feature roadmap.
- Calls out known deferred items (`COMPLETED` transition, profile edit,
  notifications, patient self-service).

---

## Constraints reference

DB-level CHECK constraints, all appended as raw SQL to the init migration
`apps/api/prisma/migrations/<timestamp>_init/migration.sql` (Prisma 5
cannot express CHECK constraints natively). The application layer mirrors
these in DTO validation for fast user feedback; the DB is the back-stop.

| Constraint                          | Table              | SQL                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patients_hn_format`                | `patients`         | `CHECK ("hn" ~ '^[0-9]{7,9}$')`                                                                                                                                                                                                                                                                                  |
| `doctor_schedules_window_valid`     | `doctor_schedules` | `CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute")`                                                                                                                                                                                                                          |
| `doctor_schedules_break_valid`      | `doctor_schedules` | `CHECK (("break_start_minute" IS NULL AND "break_end_minute" IS NULL) OR ("break_start_minute" IS NOT NULL AND "break_end_minute" IS NOT NULL AND "break_start_minute" >= "start_minute" AND "break_end_minute" <= "end_minute" AND "break_start_minute" < "break_end_minute"))`                                  |
| `appointments_end_after_start`      | `appointments`     | `CHECK ("end_at" > "start_at")`                                                                                                                                                                                                                                                                                  |

**Migration regen flow** (when the schema changes during development):
1. Drop the local Postgres schema.
2. Delete the `apps/api/prisma/migrations/<timestamp>_init/` folder.
3. `pnpm --filter @his/api prisma migrate dev --name init` (regenerates the migration without the CHECKs).
4. **Append the 4 CHECK constraints to the bottom of the new `migration.sql`.**
5. `pnpm --filter @his/api prisma migrate reset` (applies + reseeds).
