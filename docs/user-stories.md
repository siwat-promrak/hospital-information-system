# Hospital Information System — User Stories

Appointment Booking module, P0 + P1 scope.

This document groups stories by epic (E1–E12). Each epic maps to one or more
features in `feature-roadmap.md`. Story IDs are stable: when a story is
implemented, reference its ID in commit messages and PR descriptions.

Roles used in this document (matches the `Role` enum in Prisma):

- **PATIENT** — end user. Signs in with Google, completes onboarding (if no
  existing `Patient` matches their email), then can view / cancel / book
  their own appointments.
- **ADMIN** — clinic-side operator. Books and cancels appointments on behalf
  of any patient, manages doctor schedules, registers walk-in patients, and
  invites / soft-deletes other ADMIN users. The single clinic-side role —
  STAFF was removed and patient-ownership filtering with it.
- **DOCTOR** — **data-only role** in P0. A `User` with `role=DOCTOR` always
  has a linked `Doctor` row (1:1) + a `Department`, so ADMIN can book
  against them. They have **no dedicated UI portal** in this take-home (the
  spec only names "hospital staff" as users). If a DOCTOR ever signs in via
  Google, sign-in resolution succeeds and they can technically authenticate,
  but no role-specific routes exist for them yet.

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

### US-3.1 — Admin resolution on first sign-in

**US-3.1** — As an ADMIN whose account was pre-created by another ADMIN, I
want my Google sign-in to resolve to my existing `User` record, so that I
land in the admin workspace immediately.

**Acceptance criteria:**

- NextAuth `signIn` callback calls backend `POST /auth/resolve` with the
  Google profile (email, sub, name, picture), guarded by the
  `INTERNAL_API_SECRET` header.
- Backend **lowercases** the incoming email via `normalizeEmail()` before
  any lookup.
- Backend matches an existing `User` by the normalized `email` whose
  `role = ADMIN` and whose `disabledAt IS NULL`.
- The domain allowlist (`STAFF_ALLOWED_DOMAINS`) governs which email
  domains may resolve as ADMIN; non-matching domains fall through to the
  patient flow in US-3.2.
- On match, backend sets `googleSub` if previously null and returns
  `{ userId, role, patientId: null }`.
- Resolved role is encoded in the JWT and used by the home dispatcher.

**Notes / assumptions:** Admins are created via E11; this story assumes the
row exists.

### US-3.2 — Patient auto-creation on first sign-in

**US-3.2** — As a new patient signing in with Google, I want a `User` row
auto-created, so that I can proceed to onboarding without paperwork.

**Acceptance criteria:**

- `POST /auth/resolve` with a normalized email NOT matching any
  ADMIN user creates (or finds by email) a `User` with `role=PATIENT`.
- If an existing `Patient` row matches by normalized email, the new
  `User.patientId` is linked to it (auto-link; no onboarding) and the
  response carries `{ userId, role: PATIENT, patientId }`.
- If no `Patient` exists, response carries
  `{ userId, role: PATIENT, patientId: null }` and the user is routed to
  the onboarding flow.
- The email-domain allowlist (`STAFF_ALLOWED_DOMAINS`) is **not**
  consulted here — anyone signing in who is not a pre-created ADMIN is a
  patient by default.

### US-3.3 — Patient onboarding form

**US-3.3** — As a newly-created patient without a `Patient` profile, I want
to fill in my demographics, so that staff can identify me for booking.

**Acceptance criteria:**

- `/onboarding` collects: full name (prefilled from Google), date of birth,
  phone, gender, address.
- Form uses react-hook-form + zod; all fields except address are required.
- Submitting calls `POST /me/patient`; on success, backend creates a
  `Patient` row and links `User.patientId`.
- After success, user is redirected to `/[locale]` (patient home).
- Accessing any patient-area route without a linked patient redirects to
  `/onboarding`.

### US-3.4 — Home dispatcher routes by role

**US-3.4** — As a signed-in user, I want the root path to take me to the
right workspace, so that I don't have to remember role-specific URLs.

**Acceptance criteria:**

- `GET /[locale]` reads the session role:
  - `ADMIN` → renders admin dashboard.
  - `PATIENT` with linked `patientId` → renders patient dashboard.
  - `PATIENT` without `patientId` → server-side redirect to `/onboarding`.
  - Unauthenticated → server-side redirect to `/signin`.

---

## E4 — Doctor & Department directory

### US-4.1 — List departments

**US-4.1** — As staff or a patient, I want to see all departments, so that
I can filter doctors by specialty.

**Acceptance criteria:**

- `GET /departments` returns `[{ id, name, description? }]` ordered by
  `name`.
- Endpoint requires a valid session (any role).
- Department list page renders the result with localized labels.

### US-4.2 — List doctors (optionally filtered by department)

**US-4.2** — As staff or a patient, I want to browse doctors, so that I can
pick one to book with.

**Acceptance criteria:**

- `GET /doctors?departmentId=:id?` returns
  `[{ id, fullName, departmentId, departmentName, bio? }]`.
- Without the query param, returns all doctors ordered by `fullName`.
- A `/doctors` page shows the list with a department filter dropdown.

### US-4.3 — View doctor detail

**US-4.3** — As staff or a patient, I want to view a doctor's profile, so
that I can see their department, bio, and upcoming availability summary.

**Acceptance criteria:**

- `GET /doctors/:id` returns the doctor record plus a thin schedule summary
  (e.g. days of the week they have any schedule).
- `404` with `code=DOCTOR_NOT_FOUND` if the doctor does not exist.
- A `/doctors/:id` page renders the detail and offers a "Book appointment"
  CTA (only enabled for signed-in patients in E10, staff in E7).

---

## E5 — Doctor Schedule management

### US-5.1 — Admin lists schedules for a doctor

**US-5.1** — As an ADMIN, I want to view all schedule rows for a chosen
doctor, so that I can see and manage their weekly availability.

**Acceptance criteria:**

- `GET /doctors/:id/schedules` returns
  `[{ id, dayOfWeek, startMinute, endMinute, effectiveFrom, effectiveUntil? }]`
  ordered by `(effectiveFrom DESC, dayOfWeek ASC, startMinute ASC)`.
- Endpoint requires ADMIN role; PATIENT receives `403`.
- An admin UI page lists schedules grouped by day-of-week with localized
  weekday labels.

### US-5.2 — Admin creates a schedule

**US-5.2** — As an ADMIN, I want to add a new weekly recurring schedule for
a doctor, so that the slot finder can offer their availability.

**Acceptance criteria:**

- `POST /doctors/:id/schedules` accepts
  `{ dayOfWeek (0–6), startMinute, endMinute, effectiveFrom, effectiveUntil? }`.
- Validation: `0 <= startMinute < endMinute <= 1440`,
  `effectiveFrom <= effectiveUntil` when both set.
- Backend rejects schedules that overlap an existing active schedule for
  the same `(doctor, dayOfWeek)` within their effective windows
  (`code=SCHEDULE_OVERLAP`).
- Admin UI exposes a "Add schedule" dialog using MUI date pickers and a
  weekday selector.

### US-5.3 — Admin edits a schedule

**US-5.3** — As an ADMIN, I want to edit an existing schedule, so that I
can correct mistakes or change hours.

**Acceptance criteria:**

- `PATCH /doctors/:doctorId/schedules/:scheduleId` accepts a partial of
  the create payload.
- Same overlap validation as US-5.2.
- Editing a schedule does **not** retroactively cancel appointments
  already booked outside the new window — those are flagged in the UI but
  remain `BOOKED`.

### US-5.4 — Admin deletes a schedule

**US-5.4** — As an ADMIN, I want to remove a schedule, so that the doctor
stops being offered for new bookings on that day/time.

**Acceptance criteria:**

- `DELETE /doctors/:doctorId/schedules/:scheduleId` removes the row.
- Deleting a schedule does NOT cancel existing future appointments inside
  that window; the UI surfaces a count of affected future appointments
  before confirming.

---

## E6 — Appointment Types & Slot Finder

### US-6.1 — List appointment types

**US-6.1** — As staff or a patient, I want to see the available
appointment types and their durations, so that I can pick the right one
when booking.

**Acceptance criteria:**

- `GET /appointment-types` returns the hardcoded list
  `[{ code, label, durationMinutes }]` for `NEW_PATIENT_VISIT`,
  `FOLLOW_UP`, `CONSULTATION`, `PROCEDURE`.
- Endpoint requires a valid session.

### US-6.2 — Find available slots

**US-6.2** — As a booker (staff or patient), I want to query open slots
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

**Notes / assumptions:** The slot finder is the single source of truth for
"is this time bookable?"; the booking endpoints re-validate inside a
transaction to defend against races.

---

## E7 — Admin-on-behalf booking

### US-7.1 — Admin searches for a patient

**US-7.1** — As an ADMIN, I want to search for any existing patient by name,
email, or phone, so that I can book on their behalf.

**Acceptance criteria:**

- `GET /patients?q=:term` returns up to 20 matches with
  `[{ id, fullName, email?, phone? }]`.
- Search is case-insensitive partial match across name/email/phone (email
  comparison uses the normalized lowercase form).
- Endpoint requires ADMIN role; PATIENT receives `403`.

### US-7.2 — Admin books an appointment for any patient

**US-7.2** — As an ADMIN, I want to book an appointment for a patient on a
selected doctor, type, and slot, so that the patient is scheduled.

**Acceptance criteria:**

- `POST /appointments` accepts
  `{ patientId, doctorId, appointmentType, startAt, reason? }`.
- `reason` is required iff `appointmentType=PROCEDURE` (conditional zod
  schema and class-validator DTO). Stored as Postgres `text` (no length
  cap).
- Endpoint requires ADMIN role; PATIENT receives `403`.
- Backend runs inside a `$transaction` with isolation `Serializable`,
  retrying once on Postgres error `40001`.
- Transaction verifies the slot is still available against the active
  schedule and existing appointments; conflicts return `409` with
  `code=SLOT_TAKEN`.
- On success, persists `Appointment` with `status=BOOKED`,
  `createdBy=<adminUserId>`, `endAt = startAt + duration`.
- Returns the created appointment payload.

### US-7.3 — Admin sees confirmation

**US-7.3** — As an admin, I want a clear confirmation after booking, so
that I know it succeeded and can share details with the patient.

**Acceptance criteria:**

- After a successful `POST /appointments`, the UI navigates to a detail
  page showing the patient, doctor, type, date/time, and reason.
- A toast/snackbar confirms creation with a localized message.

### US-7.4 — Admin registers a walk-in patient

**US-7.4** — As an ADMIN, I want to quickly register a walk-in patient who
doesn't yet exist in the system, so that I can book them without leaving
the booking flow.

**Acceptance criteria:**

- `POST /patients` accepts `{ fullName, email?, phone?, dateOfBirth }`.
- Email (if provided) is normalized to lowercase before insertion.
- Endpoint requires ADMIN role; PATIENT receives `403`.
- Returns the created patient; admin UI then uses it in the booking
  wizard.

---

## E8 — Appointment lifecycle for admins

### US-8.1 — Admin lists appointments

**US-8.1** — As an ADMIN, I want a filterable list of appointments, so that
I can find a specific one to manage.

**Acceptance criteria:**

- `GET /appointments?doctorId=&patientId=&from=&to=&status=` returns a
  paginated list (default 20 per page, max 100).
- Default sort: `startAt ASC` for future, `startAt DESC` for past
  (controlled by `order` query param `asc|desc`).
- Endpoint requires ADMIN role.

### US-8.2 — Admin views appointment detail

**US-8.2** — As an ADMIN, I want to view the full detail of one
appointment, so that I can confirm fields before any change.

**Acceptance criteria:**

- `GET /appointments/:id` returns the appointment with embedded patient
  and doctor (name + department).
- `404` with `code=APPOINTMENT_NOT_FOUND` for missing IDs.

### US-8.3 — Admin cancels an appointment

**US-8.3** — As an ADMIN, I want to cancel any appointment, so that the
slot becomes free for reuse.

**Acceptance criteria:**

- `POST /appointments/:id/cancel` sets `status=CANCELLED`,
  `cancelledBy=<adminUserId>`, `cancelledAt=now`.
- Cancelling an already-cancelled appointment returns `409` with
  `code=APPOINTMENT_ALREADY_CANCELLED`.
- After cancellation, the slot is immediately available to other bookings
  (verified by re-running US-6.2).
- UI shows a confirm dialog before calling the endpoint.

---

## E9 — Patient self-service: view & cancel own appointments

### US-9.1 — Patient lists their own appointments

**US-9.1** — As a patient, I want to see my upcoming and past
appointments, so that I can plan around them.

**Acceptance criteria:**

- `GET /me/appointments?status=&from=&to=` returns appointments where
  `patientId = session.patientId`.
- Default split in UI: "Upcoming" (status `BOOKED`, `startAt >= now`) and
  "Past" (`status IN (COMPLETED, CANCELLED)` or `startAt < now`).
- A patient can never see another patient's appointments — backend
  enforces filter by session, ignoring any `patientId` query param.

### US-9.2 — Patient cancels their own appointment

**US-9.2** — As a patient, I want to cancel my own upcoming appointment,
so that I don't waste the doctor's time if I can't make it.

**Acceptance criteria:**

- `POST /me/appointments/:id/cancel` cancels only if the appointment
  belongs to the session's patient and is currently `BOOKED`.
- Cancelling an appointment owned by another patient returns `404`
  (not `403`, to avoid existence leak).
- Cancellation rules from US-8.3 apply (sets `cancelledBy=<patient.userId>`,
  `cancelledAt`, frees slot).
- A UI guard hides the "Cancel" button for past or non-`BOOKED`
  appointments.

---

## E10 — Patient self-service: book own appointment

### US-10.1 — Patient picks doctor and slot

**US-10.1** — As a patient, I want to choose a doctor, a date, an
appointment type, and an open slot, so that I can book myself in.

**Acceptance criteria:**

- A wizard or single-page form walks through:
  1. Department (optional filter) → Doctor.
  2. Appointment type.
  3. Date (MUI date picker, no past dates).
  4. Slot (chips populated from US-6.2).
- "Continue" is disabled until each step is valid.
- Form uses react-hook-form + zod.

### US-10.2 — Patient submits booking

**US-10.2** — As a patient, I want to submit the booking, so that the
appointment is created in my name.

**Acceptance criteria:**

- `POST /me/appointments` accepts
  `{ doctorId, appointmentType, startAt, reason? }`.
- Backend sets `patientId = session.patientId` (ignores any value in body).
- Backend sets `createdBy = session.userId`.
- Same conditional `reason` rule and concurrency model as US-7.2.
- On `409 SLOT_TAKEN`, UI re-fetches the slot list and shows an inline
  error.
- On success, UI navigates to the patient's appointment detail.

---

## E11 — Admin user management (P1)

### US-11.1 — Admin invites an ADMIN user

**US-11.1** — As an ADMIN, I want to pre-create an ADMIN (or DOCTOR) `User`
by email and role, so that they can sign in via Google immediately.

**Acceptance criteria:**

- `POST /admin/users` accepts `{ email, role (ADMIN|DOCTOR), fullName }`.
- Endpoint requires ADMIN role; PATIENT gets `403`.
- Backend rejects emails whose domain is not in
  `STAFF_ALLOWED_DOMAINS` with `code=STAFF_DOMAIN_NOT_ALLOWED`.
- Backend rejects duplicate emails with `code=USER_EMAIL_EXISTS`.
- `googleSub` is left null; it gets filled when the user first signs in.

### US-11.2 — Admin lists and filters ADMIN users

**US-11.2** — As an ADMIN, I want to see all ADMIN users with their status,
so that I can audit access.

**Acceptance criteria:**

- `GET /admin/users?role=&disabled=` returns
  `[{ id, email, fullName, role, disabledAt, createdAt }]`.
- Default returns active users only; pass `disabled=true` to include
  soft-deleted.
- ADMIN-only.

### US-11.3 — Admin soft-revokes an ADMIN user

**US-11.3** — As an ADMIN, I want to disable another ADMIN account, so that
they can no longer sign in while preserving their audit trail.

**Acceptance criteria:**

- `POST /admin/users/:id/disable` sets `disabledAt = now`.
- Disabled users fail `/auth/resolve` (returns
  `code=USER_DISABLED`); their existing `Appointment.createdBy` /
  `cancelledBy` references remain intact.
- ADMIN cannot disable their own account (`code=CANNOT_DISABLE_SELF`).
- A reactivation endpoint `POST /admin/users/:id/enable` clears
  `disabledAt`.

**Notes / assumptions:** P1 ships with both API and a simple
`/admin/users` UI in ONE feature (F11) — no API/UI split.

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
- Documents the seeded admin email and how to sign in as one of the
  seeded patients.
- Links to Swagger at `/api/v1/docs` and to the feature roadmap.
- Calls out known deferred items (`COMPLETED` transition, profile edit,
  notifications).
