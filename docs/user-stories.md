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

- **STAFF** — clinic-side operator (receptionist / coordinator). Pre-created
  by an ADMIN. Holds the role with the seeded permissions to book / cancel /
  list appointments, manage doctor schedules, register and edit patients,
  and view doctors. Cannot manage users or assign permissions. **Ownership
  filtering is NOT in P0** — every STAFF can act on every patient (no
  per-staff patient assignment).
- **ADMIN** — clinic-side superuser. Everything STAFF can do, plus invite /
  disable / list other users (`user.invite`, `user.disable`, `user.list`)
  and assign permissions to roles (`permission.assign`).
- **DOCTOR** — **data-only role** in P0. A `User` with `role.code = DOCTOR`
  always has a linked `Doctor` row (1:1) + a `Department`, so STAFF / ADMIN
  can book against them. They have **zero permissions** in P0 (no policies
  seeded) and **no dedicated UI portal**. They can technically authenticate
  via Google, but the home dispatcher routes them to a "No portal in P0"
  landing page (or back to sign-out) because nothing is authorized for them.
  This is intentional per the take-home spec scope.

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
- **Authorization via RBAC** — every protected endpoint maps to one or more
  permission codes. The Nest guard loads `user.role.policies[].permission.code`
  once per request via Prisma (cached on the request context) and checks
  the required permission against that set. The `Role` Prisma enum is gone:
  roles are now DB rows (`roles` table), permissions are code-defined
  (canonical list in `apps/api/prisma/seed/permissions.ts`), and admins
  attach permissions to roles at runtime via the `permission.assign`
  capability (US-11.5).

---

## E1 — Database foundation

Purely infrastructural epic. No user-facing stories, but the data model is
documented here so all downstream stories are grounded.

### Data model (P0)

| Model              | Purpose                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `Role`             | Named role assigned to a `User` (`code`, `name`, `description?`). Seeded with `ADMIN`, `STAFF`, `DOCTOR`. Admins may add custom roles at runtime via `permission.assign`. |
| `Permission`       | Atomic capability with a stable `code` (e.g. `appointment.create`). **Code-defined**: seeded from a canonical list in `apps/api/prisma/seed/permissions.ts`; adding a new permission requires a code change + migration. |
| `Policy`           | `(roleId, permissionId)` join row — "role R has permission P". Unique on `(roleId, permissionId)`. Granted / revoked at runtime by admins holding `permission.assign`. |
| `User`             | Auth principal. Fields incl. `email`, `googleSub?`, `roleId`, `disabledAt?`. No patient link — patients do not sign in. |
| `Patient`          | Demographic record. Pure record managed by STAFF/ADMIN. **No User link** — patients do not sign in. |
| `Department`       | Clinic department (e.g. Cardiology). Grouping for doctors.                                    |
| `Doctor`           | Practitioner. Belongs to one `Department`. 1-1 link to a `User` row with `role.code = DOCTOR`. |
| `DoctorSchedule`   | Weekly recurring availability with `dayOfWeek`, `startMinute`, `endMinute`, `effectiveFrom`, `effectiveUntil?`. |
| `AppointmentType`  | `NEW_PATIENT_VISIT` (30), `FOLLOW_UP` (15), `CONSULTATION` (20), `PROCEDURE` (60). Hardcoded const map; not a table in P0. |
| `Appointment`      | `patientId`, `doctorId`, `appointmentType`, `startAt`, `endAt`, `status`, `reason?` (Postgres `text`, no length cap), `createdByUserId`, `cancelledByUserId?`, `cancelledAt?`. |
| `StaffDomain`      | Model defined for future DB-driven allowlist; **unused in P0** (env-driven via `STAFF_ALLOWED_DOMAINS`). |

Status enum: `BOOKED`, `CANCELLED`, `COMPLETED`.
Role / Permission / Policy are DB tables, not enums (see new rows above).

### Permission catalog (P0)

The 15 canonical permission codes seeded into `permissions`:

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
| `permission.assign`   | Create / delete policies (assign permissions to roles)   |

Default policy grants (26 rows total):

- **ADMIN** → all 15 permissions.
- **STAFF** → 11 permissions (everything except `user.invite`, `user.disable`, `user.list`, `permission.assign`).
- **DOCTOR** → 0 permissions (data-only role; does not sign in to do anything in P0).

### Notes / assumptions

- Role + Permission + Policy are seeded by `apps/api/prisma/seed/{roles,permissions,policies}.ts`. The full permission catalog is canonical — adding a new permission requires a code change + migration.
- The super-admin user is bootstrapped at the nil UUID (`00000000-0000-0000-0000-000000000000`) with `role_id = NULL` so the chicken-and-egg `roles.created_by` / `users.role_id` cycle can resolve (Option C bootstrap). Its `role_id` is back-filled to ADMIN immediately after roles are seeded.
- `User.role_id` is nullable **only** to permit the bootstrap insert; every non-bootstrap user MUST have a non-null `role_id` (enforced at the API DTO layer).
- Soft-delete is used only for `User` (via `disabledAt`) to preserve FK integrity from `Appointment.createdByUserId` / `cancelledByUserId`.
- `Patient` is never soft-deleted in P0 (no requirement to "forget" patients).
- All timestamps stored as `timestamptz` (UTC), rendered clinic-local in UI.

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

### US-3.1 — Staff/Admin resolution on first sign-in

**US-3.1** — As a STAFF or ADMIN whose account was pre-created by an ADMIN,
I want my Google sign-in to resolve to my existing `User` record, so that
I land in the clinic workspace immediately.

**Acceptance criteria:**

- NextAuth `signIn` callback calls backend `POST /auth/resolve` with the
  Google profile (email, sub, name, picture), guarded by the
  `INTERNAL_API_SECRET` header.
- Backend **lowercases** the incoming email via `normalizeEmail()` before
  any lookup.
- Backend matches an existing `User` by the normalized `email` whose
  `role.code IN ('ADMIN', 'STAFF')` and whose `disabledAt IS NULL`.
- DOCTOR users (`role.code = 'DOCTOR'`) also resolve successfully, but
  they hold zero permissions in P0 — the home dispatcher routes them to
  a "No portal in P0" landing page (US-3.4).
- The domain allowlist (`STAFF_ALLOWED_DOMAINS`) governs which email
  domains may sign in at all; emails outside the allowlist that don't
  match any pre-created `User` are rejected with `code=NOT_INVITED`
  (there is no patient fallback).
- On match, backend sets `googleSub` if previously null and returns
  `{ userId, roleCode, permissionCodes[] }` (the permission list is loaded
  from `user.role.policies[].permission.code`).
- Resolved role and permissions are encoded in the JWT and used by the
  home dispatcher and per-request permission guard.

**Notes / assumptions:** Staff and admins are created via E11 (`user.invite`);
this story assumes the `User` row already exists. DOCTOR users are created
alongside their `Doctor` clinical record by seed / future tooling — the
take-home does not expose a doctor-creation UI.

### US-3.4 — Home dispatcher routes by role

**US-3.4** — As a signed-in user, I want the root path to take me to the
right workspace, so that I don't have to remember role-specific URLs.

**Acceptance criteria:**

- `GET /[locale]` reads the session role code:
  - `ADMIN` or `STAFF` → renders the clinic / staff dashboard.
  - `DOCTOR` → renders a "No portal in P0" landing page with a sign-out
    CTA (data-only role; zero permissions).
  - Unauthenticated → server-side redirect to `/signin`.
- There is no PATIENT branch — patients cannot authenticate.

---

## E4 — Doctor & Department directory

### US-4.1 — List departments

**US-4.1** — As a staff or admin user, I want to see all departments, so
that I can filter doctors by specialty.

**Acceptance criteria:**

- `GET /departments` returns `[{ id, name, description? }]` ordered by
  `name`.
- Endpoint requires the `doctor.list` permission. STAFF and ADMIN have it
  by default; DOCTOR does not (data-only role; receives `403`
  `INSUFFICIENT_PERMISSION`).
- Department list page renders the result with localized labels.

### US-4.2 — List doctors (optionally filtered by department)

**US-4.2** — As a staff or admin user, I want to browse doctors, so that I
can pick one to book with.

**Acceptance criteria:**

- `GET /doctors?departmentId=:id?` returns
  `[{ id, fullName, departmentId, departmentName, bio? }]`.
- Without the query param, returns all doctors ordered by `fullName`.
- Endpoint requires the `doctor.list` permission (STAFF + ADMIN by
  default).
- A `/doctors` page shows the list with a department filter dropdown.

### US-4.3 — View doctor detail

**US-4.3** — As a staff or admin user, I want to view a doctor's profile,
so that I can see their department, bio, and upcoming availability summary.

**Acceptance criteria:**

- `GET /doctors/:id` returns the doctor record plus a thin schedule summary
  (e.g. days of the week they have any schedule).
- Endpoint requires the `doctor.read` permission (STAFF + ADMIN by
  default).
- `404` with `code=DOCTOR_NOT_FOUND` if the doctor does not exist.
- A `/doctors/:id` page renders the detail and offers a "Book appointment"
  CTA (gated on the caller also holding `appointment.create`).

---

## E5 — Doctor Schedule management

All endpoints in this epic require the `schedule.manage` permission.
STAFF and ADMIN both hold it by default — schedule management is part of
everyday clinic operations now that STAFF is back in scope.

### US-5.1 — Staff/admin lists schedules for a doctor

**US-5.1** — As a user with `schedule.manage`, I want to view all schedule
rows for a chosen doctor, so that I can see and manage their weekly
availability.

**Acceptance criteria:**

- `GET /doctors/:id/schedules` returns
  `[{ id, dayOfWeek, startMinute, endMinute, effectiveFrom, effectiveUntil? }]`
  ordered by `(effectiveFrom DESC, dayOfWeek ASC, startMinute ASC)`.
- Endpoint requires the `schedule.manage` permission; callers without it
  receive `403 INSUFFICIENT_PERMISSION`.
- The UI page lists schedules grouped by day-of-week with localized
  weekday labels.

### US-5.2 — Staff/admin creates a schedule

**US-5.2** — As a user with `schedule.manage`, I want to add a new weekly
recurring schedule for a doctor, so that the slot finder can offer their
availability.

**Acceptance criteria:**

- `POST /doctors/:id/schedules` accepts
  `{ dayOfWeek (0–6), startMinute, endMinute, effectiveFrom, effectiveUntil? }`.
- Validation: `0 <= startMinute < endMinute <= 1440`,
  `effectiveFrom <= effectiveUntil` when both set.
- Backend rejects schedules that overlap an existing active schedule for
  the same `(doctor, dayOfWeek)` within their effective windows
  (`code=SCHEDULE_OVERLAP`).
- Endpoint requires the `schedule.manage` permission.
- The UI exposes a "Add schedule" dialog using MUI date pickers and a
  weekday selector.

### US-5.3 — Staff/admin edits a schedule

**US-5.3** — As a user with `schedule.manage`, I want to edit an existing
schedule, so that I can correct mistakes or change hours.

**Acceptance criteria:**

- `PATCH /doctors/:doctorId/schedules/:scheduleId` accepts a partial of
  the create payload.
- Same overlap validation as US-5.2.
- Endpoint requires the `schedule.manage` permission.
- Editing a schedule does **not** retroactively cancel appointments
  already booked outside the new window — those are flagged in the UI but
  remain `BOOKED`.

### US-5.4 — Staff/admin deletes a schedule

**US-5.4** — As a user with `schedule.manage`, I want to remove a schedule,
so that the doctor stops being offered for new bookings on that day/time.

**Acceptance criteria:**

- `DELETE /doctors/:doctorId/schedules/:scheduleId` removes the row.
- Endpoint requires the `schedule.manage` permission.
- Deleting a schedule does NOT cancel existing future appointments inside
  that window; the UI surfaces a count of affected future appointments
  before confirming.

---

## E6 — Appointment Types & Slot Finder

### US-6.1 — List appointment types

**US-6.1** — As a staff or admin user, I want to see the available
appointment types and their durations, so that I can pick the right one
when booking.

**Acceptance criteria:**

- `GET /appointment-types` returns the hardcoded list
  `[{ code, label, durationMinutes }]` for `NEW_PATIENT_VISIT`,
  `FOLLOW_UP`, `CONSULTATION`, `PROCEDURE`.
- Endpoint requires the `appointment.create` permission (the caller is
  about to book) — STAFF + ADMIN by default.

### US-6.2 — Find available slots

**US-6.2** — As a booker (STAFF or ADMIN), I want to query open slots
for a `(doctor, date, appointmentType)`, so that I can pick a time.

**Acceptance criteria:**

- `GET /doctors/:id/slots?date=YYYY-MM-DD&type=APPOINTMENT_TYPE` returns
  `[{ startAt, endAt }]` in chronological order.
- Slots are computed from active `DoctorSchedule` rows for the requested
  weekday and stepped by `AppointmentType.durationMinutes`.
- Slots overlapping a `BOOKED` or `COMPLETED` appointment for that doctor
  on that day are excluded.
- Slots that start in the past (relative to clinic-local "now") are
  excluded.
- Returns empty array (not `404`) when no slots are available, **including
  the case of a fully-past `date` parameter** — never `400`.
- Endpoint requires the `appointment.create` permission (the slot finder
  is adjacent to booking; anyone who can book may probe slots).

**Notes / assumptions:** The slot finder is the single source of truth for
"is this time bookable?"; the booking endpoints re-validate inside a
transaction to defend against races.

---

## E7 — Staff & admin booking on behalf

STAFF is the primary booker; ADMIN inherits the same permissions and can
do everything STAFF can. There is **no ownership filter** in P0 — every
STAFF (and ADMIN) can act on every patient.

### US-7.1 — Staff/admin searches for a patient

**US-7.1** — As a user with `patient.list`, I want to search for any
existing patient by name, identification number, or phone, so that I can
book on their behalf.

**Acceptance criteria:**

- `GET /patients?q=:term` returns up to 20 matches with
  `[{ id, fullName, dateOfBirth, phone, hn }]`.
- Search is case-insensitive partial match across name / phone /
  identification number / HN.
- Endpoint requires the `patient.list` permission (STAFF + ADMIN by
  default).
- **No ownership filter** — every match is visible to every authorised
  caller.

### US-7.2 — Staff/admin books an appointment for any patient

**US-7.2** — As a user with `appointment.create`, I want to book an
appointment for a patient on a selected doctor, type, and slot, so that
the patient is scheduled.

**Acceptance criteria:**

- `POST /appointments` accepts
  `{ patientId, doctorId, appointmentType, startAt, reason? }`.
- `reason` is required iff `appointmentType=PROCEDURE` (conditional zod
  schema and class-validator DTO). Stored as Postgres `text` (no length
  cap).
- Endpoint requires the `appointment.create` permission (STAFF + ADMIN by
  default).
- Backend runs inside a `$transaction` with isolation `Serializable`,
  retrying once on Postgres error `40001`.
- Transaction verifies the slot is still available against the active
  schedule and existing appointments; conflicts return `409` with
  `code=SLOT_TAKEN`.
- On success, persists `Appointment` with `status=BOOKED`,
  `createdByUserId=<session.userId>`, `endAt = startAt + duration`.
- Returns the created appointment payload.

### US-7.3 — Staff/admin sees confirmation

**US-7.3** — As a STAFF or ADMIN booker, I want a clear confirmation after
booking, so that I know it succeeded and can share details with the
patient.

**Acceptance criteria:**

- After a successful `POST /appointments`, the UI navigates to a detail
  page showing the patient, doctor, type, date/time, and reason.
- A toast/snackbar confirms creation with a localized message.

### US-7.4 — Staff/admin registers a walk-in patient

**US-7.4** — As a user with `patient.create`, I want to quickly register a
walk-in patient who doesn't yet exist in the system, so that I can book
them without leaving the booking flow.

**Acceptance criteria:**

- `POST /patients` accepts the full demographic payload
  (`{ fullName, dateOfBirth, gender, identificationNo, phone, address, ... }`).
- Endpoint requires the `patient.create` permission (STAFF + ADMIN by
  default).
- The created patient row is accessible to every staff/admin caller — no
  per-creator ownership relation is recorded (no `primary_staff_user_id`).
- Returns the created patient; the UI then uses it in the booking wizard.

---

## E8 — Appointment lifecycle (staff & admin)

### US-8.1 — Staff/admin lists appointments

**US-8.1** — As a user with `appointment.list`, I want a filterable list of
appointments, so that I can find a specific one to manage.

**Acceptance criteria:**

- `GET /appointments?doctorId=&patientId=&from=&to=&status=` returns a
  paginated list (default 20 per page, max 100).
- Default sort: `startAt ASC` for future, `startAt DESC` for past
  (controlled by `order` query param `asc|desc`).
- Endpoint requires the `appointment.list` permission (STAFF + ADMIN by
  default).

### US-8.2 — Staff/admin views appointment detail

**US-8.2** — As a user with `appointment.read`, I want to view the full
detail of one appointment, so that I can confirm fields before any change.

**Acceptance criteria:**

- `GET /appointments/:id` returns the appointment with embedded patient
  and doctor (name + department).
- Endpoint requires the `appointment.read` permission (STAFF + ADMIN by
  default).
- `404` with `code=APPOINTMENT_NOT_FOUND` for missing IDs.

### US-8.3 — Staff/admin cancels an appointment

**US-8.3** — As a user with `appointment.cancel`, I want to cancel any
appointment, so that the slot becomes free for reuse.

**Acceptance criteria:**

- `POST /appointments/:id/cancel` sets `status=CANCELLED`,
  `cancelledByUserId=<session.userId>`, `cancelledAt=now`.
- Endpoint requires the `appointment.cancel` permission (STAFF + ADMIN by
  default).
- Cancelling an already-cancelled appointment returns `409` with
  `code=APPOINTMENT_ALREADY_CANCELLED`.
- After cancellation, the slot is immediately available to other bookings
  (verified by re-running US-6.2).
- UI shows a confirm dialog before calling the endpoint.

---

## E11 — Admin user management (P1)

ADMIN-only operations to invite, list, and disable other users, plus
runtime role / permission management via the `permission.assign`
capability.

### US-11.1 — Admin invites a STAFF or ADMIN user

**US-11.1** — As an ADMIN, I want to pre-create a STAFF or ADMIN `User` by
email and role, so that they can sign in via Google immediately.

**Acceptance criteria:**

- `POST /admin/users` accepts `{ email, roleCode ('ADMIN' | 'STAFF'), firstNameEn, lastNameEn, ... }`.
- Endpoint requires the `user.invite` permission (ADMIN only by default).
- DOCTOR is **not** a valid `roleCode` here — DOCTOR users are created
  alongside their `Doctor` clinical record (User + Doctor pair), which the
  take-home does not expose in a user-management UI (out of scope).
- Backend rejects emails whose domain is not in
  `STAFF_ALLOWED_DOMAINS` with `code=STAFF_DOMAIN_NOT_ALLOWED`.
- Backend rejects duplicate emails with `code=USER_EMAIL_EXISTS`.
- `googleSub` is left null; it gets filled when the user first signs in.

### US-11.2 — Admin lists and filters users

**US-11.2** — As an ADMIN, I want to see all users with their role and
status, so that I can audit access.

**Acceptance criteria:**

- `GET /admin/users?roleCode=&disabled=` returns
  `[{ id, email, fullName, roleCode, disabledAt, createdAt }]`.
- Default returns active users only; pass `disabled=true` to include
  soft-deleted.
- Endpoint requires the `user.list` permission (ADMIN only by default).

### US-11.3 — Admin soft-revokes a user

**US-11.3** — As an ADMIN, I want to disable another user account, so that
they can no longer sign in while preserving their audit trail.

**Acceptance criteria:**

- `POST /admin/users/:id/disable` sets `disabledAt = now`.
- Endpoint requires the `user.disable` permission (ADMIN only by default).
- Disabled users fail `/auth/resolve` (returns
  `code=USER_DISABLED`); their existing `Appointment.createdByUserId` /
  `cancelledByUserId` references remain intact.
- ADMIN cannot disable their own account (`code=CANNOT_DISABLE_SELF`).
- A reactivation endpoint `POST /admin/users/:id/enable` clears
  `disabledAt`.

### US-11.5 — Admin assigns permissions to roles

**US-11.5** — As an ADMIN, I want to grant or revoke specific permissions
on a role, so that I can tune what STAFF (or future custom roles) can do
without code changes.

**Acceptance criteria:**

- `POST /admin/roles/:id/policies` accepts `{ permissionId }` and creates a
  new `Policy` row linking the role to the permission. Idempotent: a
  duplicate grant returns the existing policy (or `409 POLICY_EXISTS` —
  either is acceptable for v1).
- `DELETE /admin/roles/:id/policies/:permissionId` removes the policy
  (soft-delete via `deletedAt`).
- Endpoint requires the `permission.assign` permission (ADMIN only by
  default).
- **Lockout guard:** revoking `permission.assign` from the ADMIN role is
  rejected with `code=CANNOT_REMOVE_LAST_PERMISSION_ASSIGN` whenever doing
  so would leave zero active users able to manage policies. (Simplest v1:
  reject the revoke if the target role is ADMIN and the permission is
  `permission.assign`.)
- After a grant/revoke, the per-request permission cache is invalidated on
  the next call from any affected user — practically this means the user's
  permission set is re-read on each request anyway, so no explicit
  invalidation is required.

**Notes / assumptions:** The seeded baseline (ADMIN→15, STAFF→11,
DOCTOR→0) is the starting point. Admins may grant additional permissions
to STAFF or DOCTOR via this endpoint.

### US-11.6 — Admin creates a custom role (P2)

**US-11.6** — As an ADMIN, I want to create a new role (e.g. "Receptionist
Lead") and assign permissions to it, so that I can introduce role
variations without a schema change.

**Acceptance criteria:**

- `POST /admin/roles` accepts `{ code, name, description? }` and creates a
  new `Role` row (`code` is unique and conventionally UPPER_SNAKE).
- Endpoint requires the `permission.assign` permission (ADMIN only by
  default).
- Returns the new role; the admin then attaches policies via US-11.5.
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
- Documents the seeded admin and staff emails for sign-in (patients do
  not sign in).
- Documents how to verify the RBAC baseline (seeded roles, permissions,
  and policies — ADMIN→15, STAFF→11, DOCTOR→0).
- Links to Swagger at `/api/v1/docs` and to the feature roadmap.
- Calls out known deferred items (`COMPLETED` transition, profile edit,
  notifications, patient self-service).
