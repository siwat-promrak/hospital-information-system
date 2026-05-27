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
- Five roles are seeded: **ADMIN**, **DOCTOR**, **NURSE**,
  **MEDICAL_RECORDS_OFFICER**, **PHARMACY**. (Patient sign-in is out of
  scope — patients are pure records managed by NURSE / ADMIN. See the
  top callout in `user-stories.md`.)
- Permission codes are **scope-aware**: the suffix on each code
  (`.own` / `.own-department` / `.all`) tells the service layer how to
  narrow queries. Codes without a suffix (e.g. `user.invite`, `doctor.read`)
  have global semantics.
- Permission checks go through the `policies` table (role↔permission
  join). Permissions are **code-defined** (canonical list of **35** in
  `apps/api/src/auth/permissions.ts`, CRUD-verb-shaped:
  `<resource>.<create|read|update|delete>.<own|own-department|all>`); the
  role→permission assignments are **runtime-mutable** by an ADMIN holding
  `role.update` (the `permissions` table itself is catalog-only and has no
  audit cluster).
- The `roles` and `policies` tables carry an `is_deletable` column —
  every seeded row is pinned to `false` so a future F11 admin UI cannot
  delete the baseline.
- **Seeded baseline (50 policies total):**
  - **ADMIN → 9 permissions** (user + role management only): `user.create`,
    `user.read`, `user.update`, `user.delete`, `role.create`, `role.read`,
    `role.update`, `role.delete`, `doctor.read`. Clinic operations are NOT
    in the default ADMIN grant; ADMIN may grant them to themselves via
    `role.update`.
  - **DOCTOR → 15 permissions** (own-doctor scope on writes; cross-coverage
    reads on own-department): `schedule.read.own`,
    `schedule.read.own-department`, `schedule.create.own`,
    `schedule.update.own`, `schedule.delete.own`, `appointment.read.own`,
    `appointment.read.own-department`, `appointment.create.own`,
    `appointment.update.own`, `appointment.delete.own`, `patient.read`,
    `doctor.read`, `medical_records.read.all`, `medical_records.create.own`,
    `medical_records.update.own`.
  - **NURSE → 14 permissions** (department-scoped front-desk):
    `schedule.create.own-department`, `schedule.read.own-department`,
    `schedule.update.own-department`, `schedule.delete.own-department`,
    `appointment.create.own-department`, `appointment.read.own-department`,
    `appointment.update.own-department`, `appointment.delete.own-department`,
    `patient.create`, `patient.read`, `patient.update`, `patient.delete`,
    `doctor.read`, `medical_records.read.all`.
  - **MEDICAL_RECORDS_OFFICER → 9 permissions** (cross-department records):
    `patient.create`, `patient.read`, `patient.update`, `patient.delete`,
    `appointment.read.all`, `schedule.read.all`, `doctor.read`,
    `medical_records.read.all`, `medical_records.update.all`.
  - **PHARMACY → 3 permissions** (cross-department read-only):
    `patient.read`, `doctor.read`, `medical_records.read.all`.
- **Medical records table (`medical_records`):** new in this refactor —
  per-appointment clinical note authored by the assigned doctor.
  Permanent (no soft-delete column, no `medical_records.delete`
  permission). Schema mirrors the schedule denorm pattern
  (`department_id` cached from the doctor at write time).

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
| F01 ✅ | Database foundation                       | `feat/db-foundation`            | Docker Compose Postgres + Prisma schema (RBAC tables `roles` / `permissions` / `policies` with `is_deletable` columns + clinical tables incl. `medical_records`; Doctor↔Department 1:1 via `User.departmentId`) + initial migrations with raw-SQL CHECK constraints + per-table seed split + shared `PrismaService`. | E1 (data model)                                       | —             | `pnpm db:up && pnpm prisma migrate dev && pnpm db:seed` succeeds; Prisma Studio shows populated tables; `pnpm type-check && pnpm build` green.                                                                              | M      | P0       |
| F02 ✅ | Backend auth core + auth log              | `feat/auth-backend`             | NestJS `auth/` module: JWT verify (jose), guards, error filter, `POST /auth/resolve`, `POST /auth/signout`. Loads `user.role.policies` per request and exposes `permissionCodes[]` on the request context for `PermissionsGuard` / `@RequirePermission()`. Resolves all five sign-in-eligible roles (ADMIN, DOCTOR, NURSE, MEDICAL_RECORDS_OFFICER, PHARMACY). Adds the append-only `auth_logs` table (forward migration `add_auth_log`) and an `AuthLogService` that records `SIGN_IN_SUCCESS` / `SIGN_IN_FAILED` / `PERMISSION_DENIED` / `SIGN_OUT` events with optional IP + User-Agent forensic columns. | US-2.3, US-2.4, US-2.5, US-2.6, US-2.7, US-3.1        | F01           | New auth unit + e2e specs pass; `/auth/resolve` + `/auth/signout` covered by Swagger; protected stub returns `401` without cookie, `200` with valid JWT minted via test helper, `403 INSUFFICIENT_PERMISSION` when permission missing; every sign-in success / failure / permission-denial / sign-out writes exactly one row to `auth_logs`. | M      | P0       |
| F03 ✅ | Frontend NextAuth wiring + sign-in        | `feat/auth-frontend`            | Install NextAuth v5, Google provider, `/signin` page, role-aware home dispatcher, sign-out (calls F02's `POST /auth/signout` then clears the cookie). Configures NextAuth `session.maxAge` + `session.updateAge` for sliding-window renewal — no custom refresh-token model. No patient sign-in. | US-2.1, US-2.2, US-3.4                                | F02           | Manual: Google sign-in lands on `/[locale]`, role dispatcher routes ADMIN to the admin dashboard, NURSE to the clinic dashboard, DOCTOR to the schedule editor, MEDICAL_RECORDS_OFFICER + PHARMACY to their respective landing pages; sign-out calls the BE audit endpoint then clears cookie; `/signin?error=email_unverified` renders localized error. | M      | P0       |
| F05 ✅ | Doctors & departments directory           | `feat/directory`                | Read-only BE endpoints + minimal FE list/detail pages for departments and doctors. Doctor lists include the doctor's home department (sourced from the linked `User.departmentId` — Doctor↔Department is 1:1). **Shipped:** also delivered the app shell (sidebar + header + breadcrumb), the `lib/api` transport foundation, paginated list endpoints (`Paginated<T>` envelope), and the HS256 session-JWT workaround tracked as FU-01. | US-4.1, US-4.2, US-4.3                                | F02, F03      | Manual: `/departments` and `/doctors` list seeded data; doctor detail page renders the home department; NURSE can view (gated on `doctor.read`); ADMIN sees by default; pagination + filter survive page navigation.                  | M      | P0       |
| F06 ✅ | Doctor schedule CRUD                      | `feat/schedules`                | Flat BE `/schedules` CRUD (list/get/create/update/delete) + calendar UI (month + week views). Scope is enforced per CRUD verb via the scope-aware permission codes (`schedule.<verb>.own` for DOCTOR, `schedule.<verb>.own-department` for NURSE). Each schedule is a dated window (`startAt` / `endAt` UTC) carrying `departmentId` (denormalised from the doctor's `User.departmentId` at write time). Two DB CHECK constraints back-stop window/break validity; a service-layer guard rejects past-`startAt`. **Shipped:** also delivered the global snackbar (`notistack`), dayjs adoption (CLAUDE.md rule 9), the `pageSize=all` pagination sentinel (extension of CLAUDE.md §8), reusable `SearchableSelect` with server-paged infinite scroll, expanded seed (75 doctors, 2700 schedules), and the F06 API handoff doc. | US-5.1, US-5.2, US-5.3, US-5.4                        | F05           | Manual: a NURSE creates a dated schedule for a doctor in their own department; overlap returns `409 SCHEDULE_OVERLAP`; mismatched department returns `400 DOCTOR_DEPARTMENT_MISMATCH`; past `startAt` returns `400 SCHEDULE_START_IN_PAST`; edit & delete work; a DOCTOR can manage only their own schedules (foreign GET → `404`, foreign mutate → `403 INSUFFICIENT_PERMISSION_SCOPE`); a user holding only `.read.own-department` on a write call returns `403 INSUFFICIENT_PERMISSION_SCOPE`. | L      | P0       |
| F07 ✅ | Appointment types + slot finder           | `feat/slots`                    | BE-only: `/appointment-types` and `/slots?doctorId=&departmentId=&date=&type=` (flat — promoted out of `/doctors/:id/slots` so the four required filters are peers). No UI. Gated on `appointment.create.own-department`. | US-6.1, US-6.2                                        | F06           | Unit tests cover slot grid arithmetic, break-window exclusion, and exclusion of past/booked slots; manual `curl` against seed data returns expected slots; mismatched `(departmentId, type)` returns `400 DEPARTMENT_TYPE_NOT_ALLOWED`; NURSE probing a foreign department returns `403 INSUFFICIENT_PERMISSION_SCOPE`.                                                                                          | M      | P0       |
| F08 ✅ | Medical records BE module                 | `feat/medical-records`          | BE-only: `/medical-records` CRUD (list/get/create/update — **no delete**, records are permanent). Per-appointment clinical note authored by the assigned doctor (`doctor_id`, `patient_id`, `department_id` denorm cache, `appointment_id` UNIQUE, `note`, `drug?`). Scope-aware via `medical_records.read.all` / `medical_records.create.own` / `medical_records.update.own` / `medical_records.update.all`. Also lands the `Appointment.scheduleId` NOT NULL FK so every booking carries provenance back to the `DoctorSchedule` that produced it. | US-9.1, US-9.2, US-9.3, US-9.4, US-9.5                | F07           | Manual: a DOCTOR creates a record for their own appointment; an MRO updates any record; a PHARMACY user reads all records; DOCTOR attempting to update another doctor's record returns `403 INSUFFICIENT_PERMISSION_SCOPE`. A second `POST /medical-records` for the same `appointmentId` returns `409 MEDICAL_RECORD_ALREADY_EXISTS` (the `medical_records.appointment_id @unique` constraint). `Appointment.scheduleId` is NOT NULL — every booking links back to its source `DoctorSchedule`.                                                                                                                                                                                       | M      | P0       |
| F09 ✅ | Front-desk booking + lifecycle            | `feat/booking`                  | BE `POST /patients` (walk-in), `GET /patients?q=`, `POST /appointments` (inherits `departmentId` from the chosen schedule; validates `(departmentId, appointmentType)` against `department_appointment_types`), `GET /appointments`, `GET /appointments/:id`, `POST /appointments/:id/cancel` + FE booking wizard, `/appointments` list + detail + cancel dialog, `/patients/new` walk-in form. **NURSE in own department by default** (full CRUD on patients + `appointment.*.own-department`); DOCTOR can act on their own appointments via `appointment.*.own`. | US-7.1, US-7.2, US-7.3, US-7.4, US-8.1, US-8.2, US-8.3 | F08           | Manual: NURSE books for any patient in their department; conflicting double-book returns `409 SLOT_TAKEN`; mismatched `(departmentId, type)` returns `400 DEPARTMENT_TYPE_NOT_ALLOWED`; cancel frees slot; the `appointments_end_after_start` DB CHECK back-stops `endAt > startAt`.                                                                                | L      | P0       |
| F11 | Admin user + role/permission management   | `feat/admin-users`              | BE `/admin/users` (list, invite, disable, enable — invite path supports DOCTOR by creating the User + Doctor rows transactionally with the doctor's home `User.departmentId` set), `/admin/roles/:id/policies` (grant/revoke), optional `/admin/roles` (create custom role, P2 — requires `role.create`) + minimal `(app)/admin/users` & `(app)/admin/roles` UI. ADMIN starts narrow (9 user+role permissions) and may grant additional capabilities to themselves or others via `role.update`. **Single feature — no API/UI split.** | US-11.1, US-11.2, US-11.3, US-11.5 (+ US-11.6 P2)     | F03, F09      | Manual: ADMIN invites a new NURSE email; new nurse signs in successfully; ADMIN disables them; subsequent sign-in returns `USER_DISABLED`; self-disable is blocked; ADMIN grants `appointment.create.own-department` to a custom role and observes the new permission on next request; baseline `is_deletable=false` policies cannot be revoked. | L      | P1       |
| F12 | i18n parity + README                      | `chore/i18n-readme`             | Audit all strings to `messages/*.json`, add `Roles.*` / `Permissions.*` namespaces, regenerate keys, write project `README.md`. | US-12.1, US-12.2                                      | F11           | `pnpm type-check` green; manual lang switch shows no raw English on TH; README walkthrough takes a fresh clone to a running app in <15 min.                                                                                | M      | P1       |
| F13 ✅ | Per-(department, type) booking rules      | `feat/dept-type-rules`          | Move per-`AppointmentType` `durationMinutes` off the global const map onto `department_appointment_types` so each (department, type) pair has its own duration; add nullable `bookingWindowStartMinute` + `bookingWindowEndMinute` columns (wall-clock local minute-of-day in `CLINIC_TIMEZONE`) so a department can restrict a type to part of the day (e.g. Cardiology `NEW_PATIENT_VISIT` before 11:00). Wire enforcement into `SlotsService` (filter slots outside the window) + `AppointmentsService.create` (back-stop `400 APPOINTMENT_OUTSIDE_BOOKING_WINDOW`). Replace `GET /appointment-types`'s per-type duration field with a new `GET /departments/:id/appointment-types` returning `[{ code, label, durationMinutes, bookingWindowStartMinute?, bookingWindowEndMinute? }]`. Adds the `CLINIC_TIMEZONE` env (default `Asia/Bangkok`). | US-13.1, US-13.2, US-13.3, US-13.4 | F09 | Manual: a NURSE booking Cardiology `NEW_PATIENT_VISIT` for 14:00 sees no slots in the wizard AND a direct `POST /appointments` returns `400 APPOINTMENT_OUTSIDE_BOOKING_WINDOW`; a 09:30 slot books normally; per-pair durations override the old global defaults (Orthopedics `PROCEDURE` = 90 min, others unchanged). | L      | P1       |
| F14 ✅ | Appointment groups + referrals            | `feat/referrals`                | New `appointment_groups` table (`id`, `patientId`, `openedAt`, `closedAt?`, audit cluster sans `deleted_*`) + five new columns on `Appointment` (`appointmentGroupId?`, `visitNumber?`, `referredToDepartmentId?`, `referredAt?`, `referralFulfilledByAppointmentId? @unique`). Lazy group creation: `POST /appointments` accepts optional `previousAppointmentId` and materialises a fresh group on first continuation. Doctor-side visit-ending actions are RPC-style POSTs: `POST /appointments/:id/complete` (status only), `POST /appointments/:id/refer` (complete + flag referral, group stays open), `POST /appointment-groups/:id/close` (complete latest visit + close group). Destination NURSE picks up via `GET /appointments?pendingReferralToDepartmentId=<B>`. Permissions reuse `appointment.{read,create,update}.*` — no new permission codes. | US-14.1, US-14.2, US-14.3, US-14.4, US-14.5, US-14.6, US-14.7 | F13 | Manual: DOCTOR refers visit A (cardiology) to neurology → NURSE in neurology sees A in the pending queue → books visit B with `previousAppointmentId=A` → group is created, A gets `visit_number=1`, B gets `visit_number=2`, `referralFulfilledByAppointmentId` is set. DOCTOR closes the case → group's `closedAt` set, B transitions to `COMPLETED`. A subsequent `POST /appointments` with `previousAppointmentId=B` returns `400 APPOINTMENT_GROUP_CLOSED`. | L      | P1       |
| F15 ✅ | Slot finder                               | `feat/slot-finder`              | Dedicated `/find-slot` screen for ad-hoc availability search. Filters: department (visible only in ALL mode), doctor (scoped to effective dept), appointment type (required), date (single-date picker). View mode mirrors F06 — driven by `schedule.read.*` codes. Extends `GET /slots` to make `doctorId` optional (multi-doctor merge when omitted) and widens its permission gate to ALSO accept `schedule.read.all` so MRO can use it read-only. "Book this slot" CTA deep-links into the booking wizard with `doctorScheduleId` + `startAt` + `appointmentType` + `departmentId` pre-filled; CTA only renders when the caller holds `appointment.create.{own,own-department}`. | US-15.1, US-15.2, US-15.3, US-15.4 | F09 (booking wizard deep-link target), F13 (per-pair type catalog) | Manual: NURSE picks `FOLLOW_UP` + today, sees open slots across every doctor in their dept; clicks Book → wizard lands on patient picker with everything else locked. DOCTOR in OWN_PLUS_DEPT defaults to `mine` and sees only their own slots; flipping to `dept` reveals colleagues. MRO sees the slot list but no Book CTA. PHARMACY cannot reach `/find-slot` (no `schedule.read.*`). | M      | P1       |

| F16 ✅ | Standalone-visit type guard + optional reason | `feat/booking-validation-rules` | Tighten the `POST /appointments` body: standalone bookings (no `previousAppointmentId`) MUST have `appointmentType=NEW_PATIENT_VISIT`; any other type returns `400 STANDALONE_APPOINTMENT_TYPE_INVALID`. Drop the `@ValidateIf(PROCEDURE) @IsNotEmpty()` decorator from `CreateAppointmentDto.reason` — `reason` is now optional for every type. FE booking wizard: the F14 continuation-type narrowing (memo + cascade `useEffect`) now short-circuits when `hasPrefilledSlot=true`, so a find-slot deep link carrying `NEW_PATIENT_VISIT` survives the filter instead of being cleared. | US-7.2 (amended) | F09, F14, F15 | Standalone `POST /appointments` with `FOLLOW_UP` → 400 STANDALONE_APPOINTMENT_TYPE_INVALID; standalone with `NEW_PATIENT_VISIT` → 201; PROCEDURE without `reason` → 201 (was 400); FE find-slot → booking deep link no longer clears the pre-filled `NEW_PATIENT_VISIT`. | S | P1 |
| F17 ✅ | Booking-type partition completion + wizard filter | `feat/booking-type-filters` | Broaden `CONTINUATION_APPOINTMENT_TYPES` to `[FOLLOW_UP, PROCEDURE, CONSULTATION]` (was `[FOLLOW_UP, PROCEDURE]`) so the standalone / continuation sets form a complementary partition: standalone = `[NEW_PATIENT_VISIT]`, continuation = everything else. `CONSULTATION` is now reachable through `POST /appointments` (as a continuation only) — previously it was unbookable. Mirror the rule on the FE: the booking wizard's appointment-type select now filters to only `NEW_PATIENT_VISIT` in the standalone flow and to every type EXCEPT `NEW_PATIENT_VISIT` in the continuation flow. The `hasPrefilledSlot` short-circuit from F16 stays so find-slot deep links survive. | US-7.2 (amended) | F09, F14, F16 | Continuation `POST /appointments` with `CONSULTATION` + `previousAppointmentId` → 201 (was 400); continuation with `NEW_PATIENT_VISIT` → 400 CONTINUATION_APPOINTMENT_TYPE_INVALID; FE booking wizard standalone view shows only `NEW_PATIENT_VISIT`; continuation view shows every dept-allowed type minus `NEW_PATIENT_VISIT`. | S | P1 |
| F18 ✅ | Doctor workspace + RBAC collapse of medical-records mutations | `feat/doctor-workspace` | Introduces a doctor-only workspace surface: a new `/workspace` page listing the caller's visits in two sections (upcoming `BOOKED` + history `COMPLETED`/`CANCELLED`) and a **dedicated `/workspace/:id`** detail page (NOT an enhanced `/appointments/:id` — that reverted to its plain F09 form) showing patient panel, medical-records history (new `?appointmentGroupId=` filter on `GET /medical-records`, with an `?appointmentId=` fallback for standalone past visits; each card shows the authoring doctor + department), and a required note/drug panel (only while `BOOKED`) that submits with the chosen end-of-visit action. Three RPC endpoints absorb the note + drug: `POST /appointments/:id/complete` (now also closes the group when one exists — replaces the legacy `POST /appointment-groups/:id/close`), `POST /appointments/:id/refer`, and the new `POST /appointments/:id/follow-up` (atomic: complete current + create FOLLOW_UP in same group + insert record). Also adds `GET /patients/:id` (gated on `patient.read`) to feed the patient panel. RBAC delta: ADD `doctor_workspace.read.own` (FE nav/page gate only, DOCTOR-only); DELETE `medical_records.{create.own, update.own, update.all}` (records become write-once, only the workspace actions can author one). `POST /medical-records` and `PATCH /medical-records/:id` controller routes are removed; `GET /medical-records` keeps reading. | US-18.1, US-18.2, US-18.3, US-18.4, US-18.5, US-18.6 | F09, F14 | DOCTOR opens `/workspace`, sees their BOOKED queue (top) + past visits (below); opens a visit at `/workspace/:id`, writes a note, clicks Complete → appointment is `COMPLETED`, `medical_records` row inserted, and (when grouped) `appointment_groups.closedAt` set — all in one transaction. Clicking Follow Up → date+slot dialog → confirms → current visit completed AND new FOLLOW_UP appointment created in the same group with `previousAppointmentId` set. Clicking Refer → existing F14 referral flow now also creates the record. Empty `note` on any action → `400 VALIDATION_FAILED`. Direct `POST /medical-records` returns `404` (route gone). MRO loses `medical_records.update.all` → all `PATCH` calls return `404`. | L | P1 |
| F19 ✅ | Medical-records browse screen | `feat/medical-records-screen` | FE-only dedicated `/medical-records` browse page for DOCTOR / NURSE / MRO / PHARMACY (any-of `medical_records.read.all`). Patient-first workflow: typeahead patient picker at the top, paginated medical-records list below, list/grid view toggle. URL state: `?patientId=&view=list\|grid&page=N`. Consumes the existing F08/F18 `GET /medical-records?patientId=…&page=N` endpoint — no BE wire contract changes. Reuses the F09 `<PatientPicker>` typeahead and shared `<PaginationControl>`. List mode renders the F18 visit-card layout full-bleed (doctor + code, department, recorded date, full note, optional drug); grid mode is a 1/2/3-column responsive grid with note clamped to 3 lines + drug to 2. Also lifts the missing `patient: MedicalRecordPatientRef` nested ref into the FE `MedicalRecordResponse` type — the BE has always returned it, only the type was out of date. | US-19.1, US-19.2 | F08 (BE endpoint), F18 (medical-record card visuals) | DOCTOR / NURSE / MRO / PHARMACY opens `/medical-records`, sees the empty-state hint; types into the patient picker → list populates; toggles list ↔ grid → page count preserved, view persists in URL; paginates → patient + view survive; clears the patient → URL strips `patientId` + `page`. ADMIN (no `medical_records.read.all`) sees the forbidden card on direct URL navigation; sidebar entry is hidden. | M | P1 |

> **F04, F10 were removed when patient sign-in / self-service was scoped out (2026-05-24).** The feature IDs are intentionally left as gaps — IDs stay stable so commit and PR references continue to resolve. F08 was repurposed for the medical records module and F09 absorbed the original "F08 staff booking" scope when the RBAC overhaul moved booking to NURSE (department-scoped) and DOCTOR (own-doctor) instead of a blanket STAFF role.

---

## 3. Detailed feature breakdowns

Order matches the table. Each section documents *why* the feature is its
own PR, the file footprint, migrations, and a reviewer smoke test.

> **Note on `STAFF` mentions:** the F02 / F03 / F05 / F06 retrospective
> sections describe those features as they originally landed (pre-F07).
> They reference the now-retired `STAFF` role and the coarse
> `schedule.manage` permission. The F07 (`feat/slots`) RBAC overhaul
> replaced both — STAFF became NURSE (department-scoped front-desk),
> and `schedule.manage` was split into the scope-aware
> `schedule.{create,read,update,delete}.{own,own-department,all}`
> family. §1 "Roles model" + the F07 / F08 / F09 sections + §4 scope
> semantics describe the current state. Treat the older retrospectives
> as history, not behaviour.

### F01 — Database foundation (P0, M) ✅ shipped

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
  orchestrator. RBAC seeders: `roles.ts` (5 rows: ADMIN, DOCTOR, NURSE,
  MEDICAL_RECORDS_OFFICER, PHARMACY), `permissions.ts` (24 code-defined
  rows), `policies.ts` (30 rows: ADMIN→5, DOCTOR→1, NURSE→11,
  MEDICAL_RECORDS_OFFICER→7, PHARMACY→6). Clinical seeders:
  `super-admin.ts`, `users.ts`, `departments.ts`,
  `department-appointment-types.ts`, `patients.ts`. **Seed totals:**
  - 6 non-clinical users — 1 super-admin (nil UUID) + 2 ADMIN
    (`admin1@gmail.com`, `admin2@gmail.com`) + 1 NURSE
    (`nurse1@gmail.com`, anchored in the first seeded department) +
    1 MEDICAL_RECORDS_OFFICER (`records1@gmail.com`) +
    1 PHARMACY (`pharmacy1@gmail.com`).
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

### F02 — Backend auth core + auth log (P0, M) ✅ shipped

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

### F03 — Frontend NextAuth wiring + sign-in (P0, M) ✅ shipped

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

### F06 — Doctor schedule CRUD (P0, L) ✅ shipped

**Status:** shipped on `feat/schedules`. The branch lands a single squash
covering both the API + calendar UI plus the supporting infrastructure
the original brief did not anticipate:

- `feat(api): regenerate _init migration with dated doctor_schedules + raised pagination`
- `feat(api): add F06 schedules module (flat /schedules CRUD, scope, validation)`
- `feat(api): extend pagination contract with pageSize=all sentinel`
- `feat(api): expand seed with 75 doctors + 2700 dated schedules`
- `feat(api): add ?q= search to GET /doctors and drop /departments/:id/doctors`
- `feat(api): rename DTOs to *.response / *.query / *.dto conventions; extract decorators/`
- `feat(api): bootstrap dayjs at app start with utc/timezone plugins (rule 9)`
- `feat(web): add F06 schedule calendar (month + week views, day-details dialog)`
- `feat(web): add SearchableSelect + paged doctor picker server action`
- `feat(web): add SnackbarProvider + use-notify hook (i18n-keyed)`
- `feat(web): bootstrap dayjs at root layout + register Thai locale`
- `feat(web): redesign department legend (12-color palette, position-indexed)`
- `feat(web): move LocaleSwitcher into UserMenu`
- `docs: add F06 API handoff + bump CLAUDE.md rule 8 / add rule 9`

**Why a standalone feature**

Schedules drive the slot finder (F07) and the booking flow (F08).
Implementing them in their own PR isolates the dated-window overlap math,
the DOCTOR own-doctor scope, and the calendar UI from the appointment
domain — and gives a single review pass for the supporting infrastructure
(dayjs bootstrap, `pageSize=all` pagination extension, snackbar, paged
combobox) that every later feature now builds on.

**What actually shipped (delta from the original brief)**

- **Dated time windows (NOT weekly-recurring).** The brief modelled
  schedules as `dayOfWeek + startMinute + endMinute + effectiveFrom +
  effectiveUntil` — recurring weekday templates that a client expanded to
  materialise a calendar date. Mid-feature this pivoted to **concrete
  dated windows**: `startAt: DateTime + endAt: DateTime + breakStartAt? +
  breakEndAt? + acceptsBooking`. The `_init` migration was regenerated
  (destructive) to land the new column shape; the `_add_auth_log`
  follow-on migration is unaffected. Rationale and trade-offs are
  documented in the F06 API handoff (`docs/handoffs/F06-schedules-api.md`).
- **Flat `/schedules` endpoints** (not nested under
  `/doctors/:id/schedules`). The full surface is:
  - `GET /schedules?page=&pageSize=&doctorId=&departmentId=&from=&to=`
    — paginated list, sorted `startAt ASC`. Default range when neither
    `from`/`to` provided is the current calendar month UTC.
  - `GET /schedules/:id` — detail, 404 on miss or DOCTOR foreign id
    (no existence leak).
  - `POST /schedules` — create.
  - `PATCH /schedules/:id` — partial update (every field optional, no
    `doctorId`).
  - `DELETE /schedules/:id` — soft-delete, 204.

  All are `@RequirePermission(PERMISSION.SCHEDULE_MANAGE)`. DOCTOR scope:
  foreign GET → `404 SCHEDULE_NOT_FOUND` (no existence leak), foreign
  mutate → `403 INSUFFICIENT_PERMISSION_SCOPE`.
- **Past-`startAt` service-layer guard.** Create and edit both reject
  when the (post-merge) `startAt` is at or before `now` with
  `400 SCHEDULE_START_IN_PAST`. The DB cannot express `now` in a CHECK
  constraint, so this rule lives in `schedule.validation.ts`. The DB
  CHECKs (`doctor_schedules_end_after_start`,
  `doctor_schedules_break_valid`) back-stop the window/break invariants.
- **Calendar UI with month + week view toggle.** Routes:
  - `/(app)/schedules` — STAFF / ADMIN view (every doctor, optional
    department filter).
  - `/(app)/me/schedule` — DOCTOR own-doctor view (BE auto-scopes; no
    department filter).

  URL state: `?view=month|week`, `?month=YYYY-MM`, `?weekStart=YYYY-MM-DD`,
  `?departmentId=<uuid>`. Prev / Today / Next header navigation is
  view-aware (±1 month or ±7 days).
- **Day-details dialog.** Clicking a date cell in month view, or an empty
  area in a week-view column, opens a dialog listing every schedule on
  that day with a Create button. Past dates disable Create. Replaced the
  earlier "click cell → straight to create" / "+N more → jump to week"
  pattern with a single inspectable surface.
- **Lane assignment in week view.** Overlapping schedules render
  side-by-side (Google Calendar style) via greedy interval-graph coloring
  in `apps/web/src/schedule/lanes.ts`.
- **Sticky calendar headers.** The weekday / day-of-week row stays pinned
  while the calendar body scrolls inside its own container (constrained
  to `maxHeight: calc(100dvh - 240px)`).
- **Past schedules locked client-side.** When `endAt <= now`, the edit
  dialog opens in read-only form with a banner.
- **Edit-mode field locks.** When editing an existing schedule, doctor,
  department, and date are non-editable. Only times + break +
  `acceptsBooking` are mutable. The doctor lock prevents accidentally
  reassigning a schedule across doctors (matches the BE which excludes
  `doctorId` from `UpdateScheduleDto`).
- **Reusable `SearchableSelect`** in `components/shared/`. Generic over
  `<T>`, used by the doctor picker. Supports server-paged infinite
  scroll via `loadMore` / `hasMore` props. The doctor picker uses it
  with a 20-row initial page + a `loadDoctorsPageAction` server action
  paged the rest in on scroll.
- **Global snackbar.** A `notistack`-backed `SnackbarProvider` wraps the
  `(app)` layout. Server-action results are mapped through
  `ERROR_CODE_TO_KEY` and `SNACKBAR_SUCCESS_KEY` catalogs to i18n-keyed
  messages so the user never sees a raw BE error string.
- **Dayjs adopted for ALL date math** (CLAUDE.md rule 9, also added
  this PR). `apps/api/src/dayjs.ts` and `apps/web/src/lib/dayjs.ts`
  register plugins at app start: `utc`, `timezone`, `localizedFormat`,
  `isSameOrBefore`, `isSameOrAfter`, `customParseFormat`. The Thai
  locale is loaded on the FE side. Past-`startAt` validation and FE
  read-only predicate both delegate to dayjs.
- **Pagination `pageSize=all` sentinel.** Extended the global pagination
  contract (CLAUDE.md §8) to support `?pageSize=all` for the calendar's
  date-window fetch — the only safe way to bypass `MAX_PAGE_SIZE`
  because the `from`/`to` filter already caps the row count.
  `MAX_PAGE_SIZE` was raised globally from 100 → 500 to give other
  large-but-bounded views (e.g. department lists) headroom.
  Auto-applies to every list endpoint consuming `PaginationQueryDto`.
- **`GET /doctors?q=` search.** Case-insensitive substring across
  `firstNameEn/Th`, `lastNameEn/Th`, and `doctorCode`. Combines with
  `?departmentId=` via AND. Unblocks the searchable doctor picker.
- **`GET /departments/:id/doctors` removed.** Consolidated to
  `GET /doctors?departmentId=` (already returns the doctor's full
  affiliations including `isPrimary`, so no information is lost).
- **DTO naming + decorator folders.** Class-validator decorator factories
  moved to `<module>/decorators/` (e.g. `decorators/schedule-window.decorator.ts`,
  `common/pagination/decorators/page-size.decorator.ts`). DTO files now
  use the explicit `<entity>.response.dto.ts` / `<verb>-<entity>.dto.ts`
  / `list-<entities>.query.dto.ts` convention. Request bodies use a verb
  prefix without the `Request` suffix (CLAUDE.md §6b convention).
- **Seed expanded.** 75 doctors (15 hand-crafted + 60 generated) across
  all 10 departments, with 1 / 2 / 3 affiliations (42 / 20 / 13 split).
  2700 dated schedules across the past 8 + next 4 weeks (12-week window)
  driven by 5 weekday-pattern templates. Doctors with multiple
  affiliations rotate the week's schedule through every department so
  the booking flow has multi-department coverage even for 3-dept
  doctors. Volume is large enough to stress pagination + filtering.
- **Locale switcher moved into the user menu.** The previous
  `LocaleSwitcher` page-header component was removed; the locale toggle
  now lives in the user-menu dropdown so the header reserves space for
  view controls.
- **Department legend redesigned.** 12-color palette,
  position-indexed (no hash collisions across the seeded 10
  departments), uniform swatch + label rows.

**Files shipped**

Backend (`apps/api/`):
- `src/schedules/` — module, controller, service (+ spec), Swagger
  composites, types, const, `dto/` (`create-schedule.dto.ts`,
  `update-schedule.dto.ts`, `list-schedules.query.dto.ts`,
  `schedule.response.dto.ts`), `decorators/schedule-window.decorator.ts`,
  `schedule.scope.ts` (DOCTOR own-doctor enforcement), and
  `schedule.validation.ts` (affiliation + overlap + past-startAt).
- `src/common/pagination/` — extended with the `PAGE_SIZE_ALL` sentinel,
  `decorators/page-size.decorator.ts`, and tests for the new validator
  + helper.
- `src/dayjs.ts` — dayjs plugin bootstrap, imported once from
  `main.ts`.
- `src/doctors/` — added `?q=` substring search to the list endpoint;
  removed `GET /departments/:id/doctors`; DTOs split into
  `doctor.response.dto.ts` + `list-doctors.query.dto.ts`.
- `src/departments/` — DTO renamed to `department.response.dto.ts`.
- `src/auth/dto/` — three response DTOs extracted
  (`me.response.dto.ts`, `permission-check.response.dto.ts`,
  `resolve.response.dto.ts`).
- `prisma/schema.prisma` — `DoctorSchedule` rewritten to dated
  windows; two new CHECK constraints
  (`doctor_schedules_end_after_start`, `doctor_schedules_break_valid`).
- `prisma/migrations/<timestamp>_init/migration.sql` — regenerated for
  the new schema shape (destructive — see below).
- `prisma/seed/doctors.ts` + `prisma/seed/doctor-schedules.ts` —
  75 doctors + 2700 dated schedules.
- `test/schedules.e2e-spec.ts` — coverage for CRUD happy paths,
  cross-field validation, affiliation + overlap, past-startAt,
  permission gate, DOCTOR scope behaviour.

Frontend (`apps/web/`):
- `src/components/schedule/` — 11 components: `ScheduleCalendar`,
  `ScheduleMonthView`, `ScheduleWeekView`, `ScheduleBlock`,
  `ScheduleChip`, `ScheduleDayDetailsDialog`, `ScheduleDayMobileList`,
  `ScheduleFilter`, `ScheduleFormDialog`, `ScheduleHeaderNav`,
  `ScheduleViewToggle`.
- `src/components/shared/` — `SearchableSelect.tsx`,
  `SnackbarProvider.tsx`.
- `src/schedule/` — pure helpers: `lanes.ts` (lane assignment),
  `month.ts` (month grid + param helpers), `week.ts` (week grid + param
  helpers), `time.ts` (calendar constants + read-only predicate).
- `src/lib/notifications/` — `messages.const.ts`
  (`SNACKBAR_SUCCESS_KEY`, `ERROR_CODE_TO_KEY`,
  `SNACKBAR_GENERIC_ERROR_KEY`), `use-notify.ts`.
- `src/lib/dayjs.ts` — dayjs plugin + locale bootstrap, imported once
  from the root layout.
- `src/lib/utils/date.ts` — formatting + comparison helpers
  consuming the bootstrapped dayjs.
- `src/lib/api/schedule.api.ts` + `.const.ts` + `.actions.ts` — typed
  client + server actions for the schedule modal flows.
- `src/lib/api/doctor.actions.ts` — server action backing
  `SearchableSelect`'s `loadMore` for the doctor picker.
- `src/app/[locale]/(app)/schedules/page.tsx` — STAFF / ADMIN view.
- `src/app/[locale]/(app)/me/schedule/page.tsx` — DOCTOR own-doctor
  view.
- `src/types/schedule.types.ts` — `ScheduleResponse` + `LaneAssignment`
  + view discriminators.

i18n + docs:
- `messages/en.json` + `messages/th.json` — new `Schedules.*` (incl.
  errors), `Snackbar.*`, plus auxiliary keys for the new UI; regenerated
  `i18n/keys.generated.ts`.
- `docs/handoffs/F06-schedules-api.md` — full wire contract for the
  FE / consumer.

**Migration / breaking-change notes**

- **The `_init` migration was regenerated** (destructive) to switch
  `doctor_schedules` from minute-based recurring (`day_of_week`,
  `start_minute`, `end_minute`, `break_start_minute`, `break_end_minute`,
  `effective_from`, `effective_until`) to dated
  (`start_at`, `end_at`, `break_start_at`, `break_end_at`) timestamps.
  The DB CHECK pair changed from
  (`doctor_schedules_window_valid`, `doctor_schedules_break_valid`)
  (minute-based) to (`doctor_schedules_end_after_start`,
  `doctor_schedules_break_valid`) (datetime-based). The
  `_add_auth_log` follow-on migration is unaffected.
- Reviewers on a pre-F06 schema MUST drop the local DB and re-run
  `pnpm --filter @hospital/api prisma migrate dev` followed by
  `pnpm --filter @hospital/api db:seed`. Call this out in the PR
  description.
- `MAX_PAGE_SIZE` raised globally from `100` → `500` with a new
  `PAGE_SIZE_ALL = 'all'` sentinel. Existing consumers that pass a
  numeric `pageSize` keep working unchanged; the bound only matters at
  the validator.
- `GET /departments/:id/doctors` is removed. Any consumer must move to
  `GET /doctors?departmentId=<uuid>` (FE moved in this PR).

**Manual smoke test**

1. As a STAFF user, open `/schedules`. The calendar lands on the current
   calendar month, ordered chronologically.
2. Toggle to week view via the header — URL becomes
   `?view=week&weekStart=YYYY-MM-DD`. Prev / Today / Next now move by 7
   days.
3. Click an empty day cell in month view → the day-details dialog opens
   listing nothing on that day. Click "Create schedule" → schedule form
   dialog pre-fills the clicked date. Submit a 09:00–12:00 window on a
   department the doctor is affiliated with → snackbar confirms create,
   chip appears in the cell.
4. Try to create an overlapping 11:00–13:00 on the same doctor →
   `409 SCHEDULE_OVERLAP`, snackbar shows the localized error.
5. Try `departmentId` outside the doctor's affiliations →
   `409 DOCTOR_NOT_IN_DEPARTMENT`.
6. Try `startAt` in the past → `400 SCHEDULE_START_IN_PAST`.
7. Click an existing chip → edit modal opens. Doctor / department / date
   fields are disabled; times + break + `acceptsBooking` are editable.
   Save → snackbar confirms update.
8. Open a past schedule chip → modal opens in read-only mode with a
   banner. Save button is hidden.
9. Filter by department via the page-header `ScheduleFilter` →
   `?departmentId=` added to URL, only the filtered chips remain. Switching
   department resets the view (no stale chips).
10. Sign in as a DOCTOR user → land on `/me/schedule`. Sidebar exposes
    only the own-schedule entry. The doctor field on the create modal is
    locked to the caller's id. Foreign GETs return `404`; foreign
    mutates return `403 INSUFFICIENT_PERMISSION_SCOPE`.
11. Sign in as an ADMIN — `POST /schedules` returns
    `403 INSUFFICIENT_PERMISSION` because ADMIN lacks `schedule.manage`
    in the seeded baseline.

**Subsequent updates on `feat/slots`**

- **`/me/schedule` deleted; `/schedules` is now a single permission-adaptive page.**
  The same route serves four view modes resolved from the caller's
  effective scope per `schedule.read.*` + `schedule.create.*`:
  - **mode A — `all`** (MRO with `schedule.read.all`): every doctor,
    optional department filter.
  - **mode B — `own+dept`** (DOCTOR with both `schedule.read.own` +
    `schedule.read.own-department`): defaults to caller's own
    schedules; can widen to the department.
  - **mode C — `dept`** (NURSE with `schedule.read.own-department`):
    auto-narrowed to caller's own department; doctor filter narrows to
    the department's doctors.
  - **mode D — `own`** (DOCTOR without dept read): pure own-doctor.
- DOCTOR in mode B sees a Switch toggle (own / department).
- DOCTOR sees a **locked create form** (own doctor + dept pre-filled,
  picker disabled) when in dept view; matches the BE which only accepts
  `schedule.create.own` for them.
- **Form validation moved to Zod + react-hook-form** with per-field
  errors instead of the prior ad-hoc submit-time check.
- **Schedule scope enforcement tightened** — per-verb dispatch in
  `assertCanActOnDoctor` so a DOCTOR holding `.read.own-department`
  no longer accidentally widens their WRITE scope. New e2e tests cover
  both 403 cases (DOCTOR foreign-doctor mutate + NURSE foreign-dept
  mutate). The shared envelope's `INSUFFICIENT_PERMISSION_SCOPE` code
  is the canonical narrow-mismatch response.

**Known limitations**

- **DOCTOR with zero schedules cannot create their first via the UI.**
  The editor's `lockedDoctorId` is derived from the first row of the
  current listing — when the listing is empty there is no doctor id to
  lock to, so the Create button is hidden. A NURSE user must seed the
  first row for any newly-invited doctor, after which the doctor can
  manage their own schedules normally. Cleaner fixes: expose the
  caller's `doctor.id` through `/me` for the FE to read, or look up the
  linked doctor row unconditionally during the page render. Deferred —
  the seed already ships 75 doctors with full schedules, so this only
  affects fresh admin invites in a non-seeded DB.
- Existing future appointments inside a deleted or shrunk schedule
  remain `BOOKED`. F09 surfaces the count in the UI; F06 does not
  cascade-cancel.

---

### F07 — Appointment types + slot finder (P0, M) ✅ shipped

**Status:** shipped on `feat/slots`. Pure backend, pure logic; the
biggest deltas from the original brief are the **flat `/slots`
namespace** (the controller no longer lives on `/doctors/:id`) and the
RBAC alignment to scope-aware codes.

**What actually shipped (delta from the original brief)**

- **Flat `GET /slots?doctorId=&departmentId=&date=&type=`** (NOT
  `/doctors/:id/slots`). All four filters are required peers; promoting
  `doctorId` to a query param matches the rest of the flat resource
  surface (`/doctors`, `/schedules`, `/appointment-types`,
  `/medical-records`) and avoids the nested-resource intrusion where
  the controller previously borrowed `@Controller('doctors')`.
- **Permission gating: `appointment.create.own-department`** — the
  caller is about to book, so the slot finder shares the create gate.
  NURSE holds it by default; ADMIN does NOT. A NURSE probing slots for
  a foreign-department doctor returns `403 INSUFFICIENT_PERMISSION_SCOPE`
  so probing cannot leak existence.
- **Review fixes landed:** dayjs replacing `localeCompare` + `Date.getTime`
  math (CLAUDE.md rule 9), types moved to sibling `*.types.ts` files
  (CLAUDE.md rule 2a), error-code alias active for the new
  `INSUFFICIENT_PERMISSION_SCOPE` envelope code.

**Files shipped**

- `apps/api/src/appointment-types/` — module, controller, Swagger
  composites, `appointment-types.const.ts` exporting the duration map,
  `dto/appointment-type.response.dto.ts`. `GET /appointment-types`
  gated on `appointment.create.own-department`.
- `apps/api/src/slots/` — module, controller (`/slots` flat), service
  computing the grid, types, const, Swagger composites, `dto/`
  (`find-slots.query.dto.ts`, `slot.response.dto.ts`),
  `slots.service.spec.ts` covering grid step / past-date / break-window
  / booked-vs-cancelled exclusion / fully-past `date` → `[]` with 200.

**Migration / breaking-change notes**

- None.

**Manual smoke test**

```bash
curl -s "http://localhost:3001/api/v1/slots?doctorId=<seed-doctor-id>&departmentId=<dept-id>&date=2026-05-25&type=CONSULTATION" \
  -H "Cookie: next-auth.session-token=<jwt>" | jq
```

Expect chronological array; pick one and call the booking endpoint in
F09 to confirm exclusion. A NURSE probing a foreign-department doctor
returns `403 INSUFFICIENT_PERMISSION_SCOPE`. A mismatched
`(departmentId, type)` returns `400 DEPARTMENT_TYPE_NOT_ALLOWED`.

---

### F08 — Medical records BE module (P0, M) ✅ shipped

**Status:** shipped on `feat/medical-records`. The BE module itself
(controller / service / Swagger / DTOs / module wiring / per-verb
permissions / scope resolver) was actually folded INTO the earlier F07
slot-finder PR — landing the catalog + module together kept the F07
diff coherent. This branch closes the F08 deliverable by filling in
the schema invariants, the duplicate-create error path, the e2e suite,
and the roadmap ship-marking.

**What actually shipped (delta from the original brief)**

- **BE module landed inside the F07 PR.** `apps/api/src/medical-records/`
  (controller, service, Swagger composites, DTOs, types, const, module
  wiring + `MEDICAL_RECORDS_*` permissions + `resolveMedicalRecordsUpdateScope`)
  shipped on `feat/slots`. This branch extends that surface, it does not
  re-implement it.
- **`Appointment.scheduleId` NOT NULL FK** to `DoctorSchedule.id` —
  every booking now carries provenance back to the schedule the slot
  finder carved it out of. Safe to introduce without a backfill because
  zero `Appointment` rows exist yet (no seed, no application code that
  inserts an `Appointment` — F09 is still upcoming).
- **`MedicalRecord.appointmentId` is `@unique`** — exactly one clinical
  record per appointment. Duplicate `POST /medical-records` returns
  `409 MEDICAL_RECORD_ALREADY_EXISTS` (a new code in the canonical
  `ErrorCode` catalog). The service pre-checks via `findUnique({ where:
  { appointmentId } })` so the error matches the F06 `SCHEDULE_OVERLAP`
  convention, with a defensive P2002 catch as a fallback.
- **Combined forward migration** `f08_appointment_schedule_and_medical_record_unique`
  applies both schema changes in a single step (new column + new FK +
  new `(scheduleId, status)` index on `appointments`; new unique index +
  dropped redundant `(appointmentId)` index on `medical_records`).
- **E2e suite** at `apps/api/test/medical-records.e2e-spec.ts`
  (26 cases, all green). Covers every AC in this section AND every
  US-9.x acceptance criterion: per-role CRUD matrix, scope enforcement
  on create + update, duplicate-create 409, corrupt-state DOCTOR (no
  `Doctor` row) 403, permanence (DELETE returns 404 because no route
  is registered).
- **No FE work** — BE-only per the original brief. The FE consumer
  ships in F09.

**Why a standalone feature**

The clinical-note surface is new in the RBAC overhaul and has its own
permission family (`medical_records.*`) shared across DOCTOR (own-doctor
writes), NURSE (own-department reads), MRO (cross-department writes),
and PHARMACY (cross-department reads). Landing it before booking (F09)
lets every later flow attach a record to an appointment. Records are
**permanent** — no soft-delete column, no `medical_records.delete`
permission, full audit cluster on `created_at/by` + `updated_at/by`.

**Files expected to change**

- `apps/api/src/medical-records/` — module, controller, service,
  Swagger composites, types, const, `dto/` (`create-medical-record.dto.ts`,
  `update-medical-record.dto.ts`, `list-medical-records.query.dto.ts`,
  `medical-record.response.dto.ts`), `medical-records.scope.ts`,
  `medical-records.validation.ts`. Endpoints declare per-verb
  `@RequirePermission(PERMISSION.MEDICAL_RECORDS_READ_ALL | _CREATE_OWN | _UPDATE_OWN | _UPDATE_ALL)`.
- **Create acceptance** must:
  1. Verify the appointment belongs to the doctor (`appointment.doctorId === body.doctorId`).
  2. Inherit `department_id` from `appointment.department_id` (denorm cache).
  3. Caller's effective scope from `resolveMedicalRecordsCreateScope(user)`
     must be `.own` (the only scope offered on create); `doctorId` MUST
     equal `caller.doctor.id` else `403 INSUFFICIENT_PERMISSION_SCOPE`.
- **Update acceptance** narrows by the widest scope held: DOCTOR with
  `.own` may only update records they authored; MRO with `.all` may
  update any record. PHARMACY has no update permission.
- `apps/api/test/medical-records.e2e-spec.ts` — covers per-role CRUD,
  scope enforcement (`INSUFFICIENT_PERMISSION_SCOPE` on DOCTOR foreign
  update), permanence (no delete endpoint exists).

**Migration / breaking-change notes**

- The `medical_records` table itself was created by the F01 init
  migration. The F08 ship adds the combined forward migration
  `f08_appointment_schedule_and_medical_record_unique` (one step,
  two changes): a NOT NULL `appointments.schedule_id` FK to
  `doctor_schedules.id` with a supporting `(schedule_id, status)`
  index, AND a unique index on `medical_records.appointment_id`
  (replacing the redundant non-unique index). Safe to apply forward
  without a backfill because zero `Appointment` rows exist yet —
  F09 has not shipped. Apply with
  `pnpm --filter @hospital/api prisma migrate deploy`.

**Manual smoke test**

```bash
# As a DOCTOR with `medical_records.create.own`:
curl -i -X POST http://localhost:3001/api/v1/medical-records \
  -H "Cookie: next-auth.session-token=<jwt>" -H "Content-Type: application/json" \
  -d '{ "appointmentId": "<uuid>", "doctorId": "<self>", "patientId": "<uuid>",
        "note": "Stable post-op.", "drug": "Paracetamol 500mg" }'

# As a PHARMACY user, read any record:
curl -i "http://localhost:3001/api/v1/medical-records/<id>" \
  -H "Cookie: next-auth.session-token=<jwt>"

# As MRO (medical_records.update.all), update any record's note:
curl -i -X PATCH http://localhost:3001/api/v1/medical-records/<id> \
  -H "Cookie: next-auth.session-token=<jwt>" -H "Content-Type: application/json" \
  -d '{ "note": "Corrected dosage." }'
```

Expect `201` on create, `200` on the PHARMACY read, `200` on the MRO
update. A DOCTOR attempting to update another doctor's record returns
`403 INSUFFICIENT_PERMISSION_SCOPE`.

---

### F09 — Front-desk booking + lifecycle (P0, L) ✅ shipped

**Status:** shipped on `feat/booking`. Single PR ships both halves —
the appointments BE module (`POST /patients`, `GET /patients?q=`,
`POST /appointments`, `GET /appointments`, `GET /appointments/:id`,
`POST /appointments/:id/cancel`) and the FE booking wizard (3-step
patient → slot → confirm), `/appointments` list with filters,
`/appointments/[id]` detail + cancel dialog, `/patients/new` walk-in
form. Sidebar nav exposes the three new routes; NURSE + MRO landing
pages get permission-gated quick-action cards. BE handoff doc lives at
`docs/handoffs/F09-booking-api.md`.

**What actually shipped (delta from the original brief)**

- **Generic paginated picker infrastructure co-shipped.** The original
  F09 brief had a doctor-specific `useIncrementalDoctorList` hook. The
  shipped code factors that into three layers: `usePaginatedList<T>`
  (generic hook, `apps/web/src/lib/hooks/`) + `EntityPicker` (generic
  dropdown primitive) + entity-aware wrappers (`DoctorSelect`,
  `PatientPicker`). Future `NurseSelect` / `PharmacySelect` slot in
  with one action file + one entity wrapper; no new infrastructure.
  See CLAUDE.md §5a.1.
- **Every `<Select>` lives under `components/shared/select/`.** A new
  `ClearableSelect` primitive owns the `FormControl + InputLabel +
  Select + × end-adornment` boilerplate; entity-aware wrappers
  (`DepartmentSelect`, `AppointmentTypeSelect`, `AppointmentStatusSelect`,
  `OrderSelect`, `GenderSelect`, `BloodGroupSelect`) bind the catalog +
  i18n. No call site composes a select from MUI primitives directly.
  See CLAUDE.md §5a.2.
- **Global `(app)/error.tsx` boundary.** A throwing `ApiError` from any
  authenticated route serialises its HTTP status through `error.digest`
  (the only field that survives the server→client boundary in both dev
  AND prod, since Next.js scrubs `error.message` in prod) so the
  boundary can render a 403 "forbidden" / 404 "not found" / generic
  card consistently. Replaces per-page try/catch sprawl.
- **`Department.allowedAppointmentTypes` BE wire field.** Sourced from
  the existing `department_appointment_types` join; lets the booking
  wizard's type Select pre-filter to only the codes the picked
  department offers. The BE still validates on `POST /appointments`
  as the authoritative gate.
- **Slot finder day-boundary fix.** The F07 blocker query was
  day-narrowed to the requested UTC day. Schedules crossing midnight
  UTC could re-emit already-booked slots because the post-midnight
  appointment fell outside the day-narrow filter. Fixed by computing
  the union `[min(startAt), max(endAt))` across the fetched schedules.
  Locked by a new day-boundary e2e + wire-to-wire e2e (`POST` then
  `GET /slots`).
- **RBAC-aware UI throughout.** Create-schedule dialog locks dept to
  caller's home for non-`.all` scopes (NURSE, DOCTOR); appointments
  filter pins dept/doctor based on the caller's effective
  `appointment.read.*` scope (.own → both locked, .own-department →
  dept locked, .all → both editable); booking wizard's
  "Register patient" CTA only renders when `patient.create` is held;
  sidebar most-specific-match prevents `/appointments/new` from
  highlighting both "Appointments" and "Book appointment".
- **BE e2e at 122/122.** F09 added 21 appointments + 4 DOCTOR-scope
  slot tests; the boundary regression added 2 more (day-boundary +
  wire-to-wire). The widening of `/slots` + `/appointment-types` gates
  to accept `appointment.create.own` unblocks DOCTOR self-booking
  (F07 had gated on `.own-department` only).

**Why a standalone feature**

The booking write path is the highest-risk surface (transactional
correctness, per-department type validation, the standalone /
continuation type partition (F14 + F16), conflict detection). Bundling
list/detail/cancel keeps the
front-desk "lifecycle" surface in one reviewable PR. If the diff grows
too large, split into F09a (BE) and F09b (FE).

**NURSE owns the department-scoped booker surface by default**
(`appointment.*.own-department` + full `patient.*` CRUD). DOCTOR can act
on appointments they're the assigned doctor for (`appointment.*.own`).
ADMIN does NOT hold any `appointment.*` / `patient.*` permission in the
seeded baseline; an ADMIN who needs to book or manage patients must
first grant the relevant permission(s) via `role.update` (US-11.5).

**Files expected to change**

- `apps/api/src/appointments/` — module, controller, service, DTOs
  (`create-appointment.dto.ts`, `list-appointments.query.dto.ts`,
  `cancel-appointment.dto.ts`), `swagger/` subfolder. Endpoints declare
  per-verb scope-aware `@RequirePermission` (e.g.
  `PERMISSION.APPOINTMENT_CREATE_OWN | _OWN_DEPARTMENT`). Each verb
  resolves its widest scope via `resolveAppointment<Verb>Scope(user)`.
- `apps/api/src/appointments/appointments.service.ts` — transactional
  create with `Prisma.TransactionIsolationLevel.Serializable`, single
  retry on `40001`. `createdBy` is set from `session.userId`.
- **Booking acceptance** must:
  1. Inherit `Appointment.departmentId` from the chosen
     `DoctorSchedule` (the FE passes back the `departmentId` returned by
     the slot finder).
  2. Verify the chosen doctor's home department (sourced from
     `doctor.user.departmentId`) matches `departmentId`; else
     `400 DOCTOR_DEPARTMENT_MISMATCH`.
  3. Verify `(departmentId, appointmentType)` exists in
     `department_appointment_types`; else `400 DEPARTMENT_TYPE_NOT_ALLOWED`.
  4. Re-validate the slot against active schedules
     (`(doctor_id, department_id)`-filtered by `[startAt, endAt)`
     intersection — F06 schedules are dated windows) and existing
     non-cancelled appointments; on conflict return `409 SLOT_TAKEN`.
  5. Persist with `status=BOOKED`, `endAt = startAt + duration`. The
     DB CHECK `appointments_end_after_start` back-stops the math.
- `apps/api/src/patients/` — `POST /patients` (walk-in,
  `@RequirePermission(PERMISSION.PATIENT_CREATE)`), `GET /patients?q=`
  (`@RequirePermission(PERMISSION.PATIENT_READ)`). **No ownership filter**
  — every authorised caller sees every patient. The walk-in payload
  omits `hn` — the service assigns one matching `^[0-9]{7,9}$`; the DB
  CHECK `patients_hn_format` back-stops format drift.
- `apps/api/test/appointments.e2e-spec.ts` — happy path, slot conflict
  (`409 SLOT_TAKEN`), mismatched
  department/type (`400 DEPARTMENT_TYPE_NOT_ALLOWED`), cancel frees slot,
  scope denial (NURSE on foreign department, DOCTOR on foreign doctor)
  returns `403 INSUFFICIENT_PERMISSION_SCOPE`.
- `apps/web/src/app/[locale]/(app)/appointments/page.tsx` — list with
  filters (now includes `departmentId` filter, auto-narrowed for NURSE
  to their own department).
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

1. As a NURSE in Cardiology, open `/appointments/new`, search → results
   show any patient; pick one, pick a Cardiology doctor +
   `NEW_PATIENT_VISIT` + tomorrow + first slot, submit (standalone
   bookings must use `NEW_PATIENT_VISIT` — F16).
2. In a second tab repeat with the same slot → `409 SLOT_TAKEN` shown.
3. Open the new appointment detail → cancel → toast confirms.
4. Re-run step 2's request → `200` (slot freed).
5. Try `PROCEDURE` against a department that doesn't offer
   `PROCEDURE` (e.g. Emergency Medicine) →
   `400 DEPARTMENT_TYPE_NOT_ALLOWED`.
6. Try a standalone booking with `FOLLOW_UP` →
   `400 STANDALONE_APPOINTMENT_TYPE_INVALID` (F16). `reason` is now
   optional for every type — submitting `PROCEDURE` without `reason`
   returns `201`.
7. As the same NURSE, attempt to book for a doctor in a foreign
   department → `403 INSUFFICIENT_PERMISSION_SCOPE`.
8. Repeat step 1 as an ADMIN user — `403 INSUFFICIENT_PERMISSION` (the
   ADMIN must first self-grant `appointment.create.own-department` via
   `role.update` to proceed).

---

### F11 — Admin user + role/permission management (P1, L)

**Why a standalone feature**

ADMIN-only surface, dedicated guard, env-driven domain allowlist, and
the runtime policy CRUD that lets admins re-shape any role's
permissions without a deploy. All three warrant a single review pass
that exercises the `permission.assign` flow end-to-end. UI is optional
polish; the API is the cuttable contract.

**Permissions overview**

- The seeded permission catalog has **35** scope-aware CRUD codes
  (`<resource>.<create|read|update|delete>.<own|own-department|all>`).
  Seeded policy distribution is **50** rows total: ADMIN→9, DOCTOR→15,
  NURSE→14, MEDICAL_RECORDS_OFFICER→9, PHARMACY→3 (see §1.3).
- ADMIN starts with the user + role management bundle (`user.*` 4 +
  `role.*` 4 + `doctor.read` 1 = 9). Clinic operations are NOT in the
  default ADMIN grant — ADMIN may grant them to themselves or others at
  runtime via `role.update` (which also covers policy assignment).
- The custom-role-creation endpoint (US-11.6) lets admins introduce role
  variations (e.g. "Receptionist Lead") without code changes via
  `role.create`.
- Baseline `roles` and `policies` rows are pinned `is_deletable=false`
  so a future F11 admin UI cannot delete the seeded baseline; only
  custom roles / runtime-added policies are deletable.

**Files expected to change**

- `apps/api/src/admin/` — module, controller, service, DTOs, `swagger/`.
- `apps/api/src/admin/admin.controller.ts` — user management:
  `POST /admin/users` (`@RequirePermission(PERMISSION.USER_CREATE)`) —
  supports `roleCode='DOCTOR'` by additionally creating the `Doctor`
  (1-1) inside a single Prisma `$transaction`; the doctor's home
  department comes from `User.departmentId` set on the same insert
  (Doctor↔Department is 1:1); `GET /admin/users` (`user.read`),
  `POST /admin/users/:id/disable` (`user.delete`),
  `POST /admin/users/:id/enable` (`user.update`); role + policy
  management: `POST /admin/roles/:id/policies` and
  `DELETE /admin/roles/:id/policies/:permissionId`
  (`@RequirePermission(PERMISSION.ROLE_UPDATE)`); optional
  `POST /admin/roles` (P2, `@RequirePermission(PERMISSION.ROLE_CREATE)`).
- `apps/api/src/auth/` — extend resolver to reject
  `deletedAt != null` (disabled) with `code=USER_DISABLED`; reject
  not-pre-created users with `code=NOT_INVITED`.
- `apps/api/src/admin/policy.service.ts` — `is_deletable` invariant:
  rejects revoking any seeded baseline policy with
  `code=POLICY_NOT_DELETABLE`, and rejects deleting any seeded baseline
  role with `code=ROLE_NOT_DELETABLE`. Custom roles + runtime-added
  policies (default `is_deletable=true`) can be revoked freely.
- `apps/api/test/admin-users.e2e-spec.ts` — invite (ADMIN, NURSE,
  DOCTOR, MRO, PHARMACY), disable, self-disable guard, domain rejection.
- `apps/api/test/admin-policies.e2e-spec.ts` — grant + revoke,
  duplicate-grant idempotency, `is_deletable=false` block on baseline
  rows, ADMIN-self-grant flow (e.g. ADMIN grants
  `appointment.create.own-department` to ADMIN, then can book).
- `apps/web/src/app/[locale]/(app)/admin/users/page.tsx` — list +
  invite + disable controls (with DOCTOR-specific sub-form for
  `doctorCode` / `medicalLicenseNo` / `identificationNo` /
  `departmentId`).
- `apps/web/src/app/[locale]/(app)/admin/roles/page.tsx` — list roles,
  show permission grid (35 columns), toggle grants (only visible to
  users with `role.update`).

**Migration / breaking-change notes**

- None — uses the soft-delete cluster on `users` (the "disabled" state
  is `deletedAt != null` + `deletedBy = <admin>`) and the RBAC tables
  seeded by F01.
- If this feature is cut to API-only, document so in PR description and
  link the deferred UI as a follow-up.

**Manual smoke test**

1. As ADMIN, invite `colleague@gmail.com` with `roleCode=NURSE` and
   `departmentId=<cardiology-id>` → row appears in the list.
2. Sign in as that account (Google) → succeeds, lands on the clinic
   dashboard scoped to Cardiology.
3. Back as ADMIN, disable that user.
4. The disabled user signs out and tries to sign in again → blocked
   with `USER_DISABLED` error on `/signin?error=user_disabled`.
5. ADMIN attempts to disable self → `400 CANNOT_DISABLE_SELF`.
6. ADMIN creates a custom role "Receptionist Lead" via
   `POST /admin/roles` and grants `appointment.delete.own-department` to
   it. After the grant, a newly-signed-in user of that role can
   `POST /appointments/:id/cancel` successfully within their department.
7. ADMIN revokes the same policy. The user's next cancel attempt returns
   `403 INSUFFICIENT_PERMISSION`.
8. ADMIN attempts to revoke a seeded baseline policy (e.g.
   `doctor.read` from ADMIN) → `409 POLICY_NOT_DELETABLE`.
9. ADMIN invites a DOCTOR user with `departmentId=<cardiology-id>` → the
   User + Doctor rows are created atomically. The new doctor signs in
   and lands on the schedule editor.

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

### F13 — Per-(department, type) booking rules (P1, L) ✅ shipped

**Why a standalone feature**

Today every department offers the same four appointment categories on
the same duration grid (`NEW_PATIENT_VISIT=30`, `FOLLOW_UP=15`,
`CONSULTATION=20`, `PROCEDURE=60`) and any time of day a doctor's
schedule covers. Real clinics want per-department control:

- A `PROCEDURE` in Orthopedics may need 90 minutes; in Dermatology, 30.
- Cardiology may want `NEW_PATIENT_VISIT` confined to mornings so the
  doctor can run follow-ups in the afternoon.

The two rules — duration and booking window — share the same
cardinality (one row per `(department, appointment_type)` pair) and the
same enforcement surface (`SlotsService` and `AppointmentsService`), so
bundling them into one migration keeps the table churn down to a single
schema change.

**Files expected to change**

- `apps/api/prisma/schema.prisma` — `DepartmentAppointmentType` gains:
  - `durationMinutes Int @map("duration_minutes")` (required, replaces
    the global `APPOINTMENT_TYPE_DURATION_MINUTES` map).
  - `bookingWindowStartMinute Int? @map("booking_window_start_minute")`
    — nullable wall-clock minute-of-day in `CLINIC_TIMEZONE`.
  - `bookingWindowEndMinute Int? @map("booking_window_end_minute")`
    — nullable.
- `apps/api/prisma/migrations/<timestamp>_dept_type_rules/migration.sql`
  — forward migration:
  1. `ADD COLUMN duration_minutes INT NOT NULL DEFAULT 0` then per-type
     `UPDATE` backfill (mirror the current const map), then drop the
     `DEFAULT`.
  2. `ADD COLUMN booking_window_start_minute INT NULL`,
     `booking_window_end_minute INT NULL`.
  3. Append three raw-SQL CHECK constraints (Prisma 5 cannot express
     them natively, per the F01 pattern):
     - `department_appointment_types_duration_positive` —
       `CHECK (duration_minutes > 0 AND duration_minutes <= 480)`.
     - `department_appointment_types_window_bounds` —
       `CHECK ((booking_window_start_minute IS NULL OR
        (booking_window_start_minute >= 0 AND
         booking_window_start_minute < 1440))
       AND (booking_window_end_minute IS NULL OR
        (booking_window_end_minute > 0 AND
         booking_window_end_minute <= 1440)))`.
     - `department_appointment_types_window_order` —
       `CHECK (booking_window_start_minute IS NULL OR
              booking_window_end_minute IS NULL OR
              booking_window_start_minute < booking_window_end_minute)`.
- `apps/api/prisma/seed/department-appointment-types.ts` — write
  per-pair durations (start from the old global defaults, tweak the few
  rows the product wants different, e.g. Orthopedics `PROCEDURE` = 90,
  Cardiology `NEW_PATIENT_VISIT` window `[null, 660]`).
- `apps/api/src/appointment-types/appointment-types.const.ts` — drop
  `APPOINTMENT_TYPE_DURATION_MINUTES` (keep `APPOINTMENT_TYPE_LABEL` +
  `APPOINTMENT_TYPE_ORDER`); the global `GET /appointment-types` becomes
  a pure label catalog.
- `apps/api/src/departments/` — add
  `GET /departments/:id/appointment-types` returning
  `[{ code, label, durationMinutes, bookingWindowStartMinute?,
       bookingWindowEndMinute? }]` for the chosen department. This is
  what the booking wizard fetches once the user picks a department.
  Gated on `appointment.read.*` (any scope).
- `apps/api/src/slots/slots.service.ts` — look up the duration from the
  `(departmentId, type)` row that the existing
  `DEPARTMENT_TYPE_NOT_ALLOWED` check already loads (no extra round
  trip). Filter grid slots whose `startAt` (converted to local
  minute-of-day via `dayjs.utc(startAt).tz(CLINIC_TIMEZONE)`) falls
  outside the booking window.
- `apps/api/src/appointments/appointments.service.ts` — same lookup,
  reject creates outside the window with
  `400 APPOINTMENT_OUTSIDE_BOOKING_WINDOW`.
- `apps/api/src/common/errors.ts` — add the new `ErrorCode`.
- `apps/api/.env.example` — `CLINIC_TIMEZONE=Asia/Bangkok` (loaded once
  in `apps/api/src/dayjs.ts` and passed to the conversion helper). The
  env defaults to `Asia/Bangkok` in code so a missing var fails safe.
- `apps/web/src/lib/api/department.api.ts` + `.const.ts` — add the new
  `GET /departments/:id/appointment-types` typed client.
- `apps/web/src/components/booking/...` — wizard step that picks the
  type now consumes the per-department list; the type chip surfaces
  the window copy (`"Before 11:00 only"`) so the user understands why
  later slots are missing.

**Design principle (CLAUDE.md addendum — codify in rule 9)**

> Store **instants** (a specific moment in time) in UTC. Store
> **recurring daily business rules** (cutoffs, opening times, booking
> windows) as a wall-clock minute-of-day in the clinic's local timezone.
> Comparison happens at the check site:
> `dayjs.utc(startAt).tz(CLINIC_TIMEZONE).hour() * 60 + minute()`.
> Storing a daily boundary as a UTC minute-of-day silently breaks the
> moment the clinic's day crosses the UTC date line (DST, timezone
> move, late-night / early-morning slots).

**Migration / breaking-change notes**

- One forward migration on top of `_init` + `_add_auth_log`. Apply with
  `pnpm --filter @hospital/api prisma migrate dev`. No drop-and-recreate
  needed — the new columns are additive (the required `duration_minutes`
  is backfilled in the same migration).
- `GET /appointment-types` no longer returns `durationMinutes`. The
  booking wizard MUST move to `GET /departments/:id/appointment-types`
  before this PR lands on `main`. (This is mostly internal — only the
  wizard consumes it today.)
- `APPOINTMENT_TYPE_DURATION_MINUTES` is removed. Any test fixture
  importing it must move to a hardcoded literal or read from a seeded
  `DepartmentAppointmentType` row.

**Manual smoke test**

```bash
# Run the migration + reseed
pnpm --filter @hospital/api prisma migrate dev
pnpm --filter @hospital/api db:seed

# Verify the per-department catalog
curl -s "http://localhost:3001/api/v1/departments/<cardiology-id>/appointment-types" \
  -H "Cookie: next-auth.session-token=<nurse-jwt>" | jq

# Verify the booking-window rejection (NURSE in Cardiology, 14:00 local)
curl -i -X POST "http://localhost:3001/api/v1/appointments" \
  -H "Cookie: next-auth.session-token=<nurse-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "patientId": "...", "doctorScheduleId": "...",
        "appointmentType": "NEW_PATIENT_VISIT",
        "startAt": "2026-05-27T07:00:00Z" }'
# expect 400 APPOINTMENT_OUTSIDE_BOOKING_WINDOW

# A morning slot books normally
curl -i -X POST "http://localhost:3001/api/v1/appointments" \
  ... "startAt": "2026-05-27T02:30:00Z" (= 09:30 Bangkok)
# expect 201
```

Expected: the per-department catalog reflects the seeded overrides
(Cardiology `NEW_PATIENT_VISIT` carries `bookingWindowEndMinute: 660`);
the 14:00 booking is rejected; the 09:30 booking succeeds; the
Cardiology page in the booking wizard hides afternoon slots for
`NEW_PATIENT_VISIT` and shows them again for `FOLLOW_UP`.

---

### F14 — Appointment groups + referrals (P1, L)

**Why a standalone feature**

Today every `Appointment` is a standalone row. Real clinics need to
link visits within a clinical thread — a follow-up to a prior
`NEW_PATIENT_VISIT` belongs in the same case, and a referral to
another specialist continues that case in a different department.
Without grouping, "all visits for Mrs. Smith's diabetes thread" is
unrecoverable from her mixed timeline of unrelated complaints.

This feature lands a new `appointment_groups` table + five additive
columns on `Appointment`. Groups are materialised lazily inside
`POST /appointments` (no separate `POST /appointment-groups` endpoint).
Referral state lives on the originating `Appointment` row — the row
IS the referral record, so a dedicated `appointment_referrals` table
is deferred until explicit referral metadata (urgency, structured
reason codes) becomes a need. Permissions reuse the existing
`appointment.*` family — zero new permission codes.

**Files expected to change**

- `apps/api/prisma/schema.prisma` —
  - New `AppointmentGroup` model with `openedAt`, `closedAt?`, and the
    audit cluster minus `deleted_*` (mirrors `Appointment`).
  - `Appointment` gains five columns: `appointmentGroupId?`,
    `visitNumber?`, `referredToDepartmentId?`, `referredAt?`,
    `referralFulfilledByAppointmentId? @unique`.
  - Inverse relations on `Patient`, `Department`, `User` for the new
    FKs.
- `apps/api/prisma/migrations/<timestamp>_appointment_groups/migration.sql`
  — forward migration:
  1. `CREATE TABLE appointment_groups` with the four audit FKs to
     `users` (`created_by` required, `updated_by` nullable).
  2. `ALTER TABLE appointments ADD COLUMN appointment_group_id UUID NULL
     REFERENCES appointment_groups(id) ON DELETE NO ACTION`.
  3. `ALTER TABLE appointments ADD COLUMN visit_number INT NULL`.
  4. `ALTER TABLE appointments ADD COLUMN referred_to_department_id
     UUID NULL REFERENCES departments(id) ON DELETE NO ACTION`.
  5. `ALTER TABLE appointments ADD COLUMN referred_at TIMESTAMPTZ(3)
     NULL`.
  6. `ALTER TABLE appointments ADD COLUMN referral_fulfilled_by_appointment_id
     UUID NULL UNIQUE REFERENCES appointments(id) ON DELETE NO ACTION`.
  7. `CREATE INDEX ... ON appointments(appointment_group_id)` (group
     rollup hot path).
  8. `CREATE INDEX ... ON appointments(referred_to_department_id)
     WHERE referral_fulfilled_by_appointment_id IS NULL` (pickup queue
     hot path — partial index keeps it small).
  9. `CREATE INDEX ... ON appointment_groups(patient_id, closed_at)`.
  10. Append raw-SQL CHECK constraints (Prisma 5 limitation, per F01
      pattern):
      - `appointments_visit_number_consistency` —
        `CHECK ((appointment_group_id IS NULL AND visit_number IS NULL)
              OR (appointment_group_id IS NOT NULL AND visit_number IS NOT NULL
                  AND visit_number >= 1))`.
      - `appointments_referral_pair_consistency` —
        `CHECK ((referred_to_department_id IS NULL AND referred_at IS NULL)
              OR (referred_to_department_id IS NOT NULL AND referred_at IS NOT NULL))`.
  11. `CREATE UNIQUE INDEX appointments_group_visit_number_unique
      ON appointments(appointment_group_id, visit_number)
      WHERE appointment_group_id IS NOT NULL` (partial unique — only
      grouped rows participate).
- `apps/api/src/appointment-groups/` — new module:
  - `appointment-groups.module.ts`, `appointment-groups.controller.ts`,
    `appointment-groups.service.ts`, `appointment-groups.swagger.ts`,
    `appointment-groups.const.ts`, `appointment-groups.types.ts`.
  - `dto/appointment-group.response.dto.ts` —
    `AppointmentGroupResponseDto` + `AppointmentGroupDetailResponseDto`
    (with chronological member list) + inner ref types
    (`AppointmentGroupLatestVisitDto`).
  - `dto/list-appointment-groups.query.dto.ts` — extends
    `PaginationQueryDto`; `patientId` (UUID, required), `status`
    (`open` / `closed` / `all`, default `all`).
- `apps/api/src/appointments/` — controller + service additions:
  - `POST /appointments` body gains optional
    `previousAppointmentId`. Service runs the lazy-group transaction
    described in US-14.2; introduces error codes
    `PREVIOUS_APPOINTMENT_CANCELLED`,
    `APPOINTMENT_GROUP_CLOSED`, `APPOINTMENT_GROUP_PATIENT_MISMATCH`,
    `REFERRAL_DEPARTMENT_MISMATCH`, `REFERRAL_ALREADY_FULFILLED`.
  - `POST /appointments/:id/complete` — new endpoint.
  - `POST /appointments/:id/refer` — new endpoint. Body:
    `{ toDepartmentId: string }`. Atomic complete + flag referral.
    Error: `APPOINTMENT_ALREADY_REFERRED` on duplicate.
  - `GET /appointments` query DTO gains optional
    `pendingReferralToDepartmentId` filter.
- `apps/api/src/common/errors.ts` — add the seven new `ErrorCode`
  entries.
- `apps/api/src/appointment-groups/scope.ts` (optional) — only if the
  group resolver duplicates the appointment scope helpers; otherwise
  reuse `resolveAppointmentReadScope` from
  `apps/api/src/auth/scope.ts` directly.
- `apps/api/prisma/seed/` — no required seed changes; F14 starts with
  zero groups (existing appointments stay NULL). Optionally extend
  `appointments.ts` to seed a small handful of pre-grouped cases so
  reviewers see the UI on first load — defer until the feature ships
  if time-pressed.
- `apps/web/src/components/booking/` — booking-wizard adds one step
  ("Is this a continuation?") + the "Continue case" picker consuming
  `GET /appointment-groups?patientId=&status=open`.
- `apps/web/src/components/appointments/` — appointment detail page
  gains three doctor-only action buttons (Complete / Refer / Close
  case) shown per role + per row state. The Refer button opens a
  department-picker modal.
- `apps/web/src/app/[locale]/(app)/referrals/page.tsx` (new) —
  destination-department pickup queue, paginated, gated on
  `appointment.read.own-department`.
- `apps/web/src/lib/api/appointment-group.api.ts` + `.const.ts` +
  `.actions.ts` — typed client + server actions.
- `apps/web/src/types/appointment-group.types.ts` — FE mirror of the
  group response shapes.
- `apps/web/messages/{en,th}.json` — new `AppointmentGroups.*`,
  `Referrals.*`, `BookingWizard.Continuation.*` namespaces; regenerate
  `i18n/keys.generated.ts`.

**Wire surface summary**

| Endpoint | Atomic effect | Auth |
| --- | --- | --- |
| `POST /appointments` (body gains `previousAppointmentId?`) | Insert. If continuation: validate + attach to / create group + fulfil referral where applicable. | `appointment.create.{own,own-department}` on destination dept. |
| `POST /appointments/:id/complete` | `status` → `COMPLETED`. No group / referral side-effect. | Doctor of the appointment. |
| `POST /appointments/:id/refer` | `status` → `COMPLETED` + set `referredToDepartmentId` + `referredAt`. Group stays open. | Doctor of the appointment. |
| `GET /appointments?pendingReferralToDepartmentId=<B>` | Pending pickup queue at department `B`. | `appointment.read.own-department` on `B` (or `.all`). |
| `GET /appointment-groups?patientId=&status=open\|closed\|all` | Patient's groups (paginated). | `appointment.read.*` covering at least one member. |
| `GET /appointment-groups/:id` | Group detail with chronological members. | Same as above. |
| `POST /appointment-groups/:id/close` | Latest non-cancelled appointment → `COMPLETED` + group `closedAt = now()`. | Doctor of the latest non-cancelled appointment. |

**Permissions**

Zero new codes. Effective mapping uses existing
`appointment.{read,create,update}.{own,own-department,all}`:

- Read group / pickup queue / detail → `appointment.read.*` covering
  at least one member of the group.
- Complete / refer / close → `appointment.update.*` covering the
  source row (typically `.own` on the doctor's own row).
- Pick up referral (create new appointment in destination dept) →
  `appointment.create.own-department` in that dept.

The permission catalog stays at 35.

**Migration / breaking-change notes**

- Single forward migration on top of `_init` + `_add_auth_log` +
  `_dept_type_rules`. Apply with
  `pnpm --filter @hospital/api prisma migrate dev`. All columns are
  additive nullable, so no backfill: pre-existing appointments stay
  `appointment_group_id = NULL`, `visit_number = NULL`, all referral
  fields `NULL`.
- `POST /appointments` gains a new optional body field
  (`previousAppointmentId`). Backwards compatible.
- The `GET /appointments` query gains a new optional filter
  (`pendingReferralToDepartmentId`). Backwards compatible.
- New error codes — FE error-mapping catalog
  (`apps/web/src/lib/notifications/messages.const.ts`'s
  `ERROR_CODE_TO_KEY`) must add the new keys, else the user sees the
  generic snackbar.

**Manual smoke test**

```bash
# Two doctors in different departments
DOC_A_JWT=...  # cardiology doctor
DOC_B_NURSE_JWT=...  # neurology nurse
DOC_B_JWT=...  # neurology doctor (assigned to the picked-up appointment)
PATIENT_ID=...

# 1. Book a first appointment with DOC_A. Standalone, no group.
curl -X POST .../appointments -d '{ patientId, doctorScheduleId, appointmentType }'
APPT_A_ID=...

# 2. DOC_A refers to neurology after completing the visit
curl -X POST .../appointments/$APPT_A_ID/refer \
  -d '{ "toDepartmentId": "<neuro-id>" }'
# expect APPT_A.status = COMPLETED, referredToDepartmentId set

# 3. DOC_B_NURSE sees the pending referral
curl ".../appointments?pendingReferralToDepartmentId=<neuro-id>"
# expect APPT_A in the result

# 4. DOC_B_NURSE books the pickup
curl -X POST .../appointments \
  -d '{ patientId, doctorScheduleId (neuro), appointmentType,
        previousAppointmentId: APPT_A_ID }'
APPT_B_ID=...
# expect: new AppointmentGroup created;
#         APPT_A.appointmentGroupId = APPT_B.appointmentGroupId;
#         APPT_A.visitNumber = 1, APPT_B.visitNumber = 2;
#         APPT_A.referralFulfilledByAppointmentId = APPT_B_ID

# 5. DOC_B closes the case after their visit
curl -X POST .../appointment-groups/<group-id>/close
# expect group.closedAt set; APPT_B.status = COMPLETED

# 6. Attempt to attach a third visit to the closed group
curl -X POST .../appointments \
  -d '{ ..., previousAppointmentId: APPT_B_ID }'
# expect 400 APPOINTMENT_GROUP_CLOSED
```

Expected outcomes are inline in the script. Spot-check the
`appointment_groups` table in Prisma Studio to confirm the group
exists with `openedAt` set, `closedAt` set after step 5, audit columns
populated (`created_by` is the NURSE who booked step 4; `updated_by`
is the DOCTOR who called close in step 5).

---

### F15 — Slot finder (P1, M)

**Why a standalone feature**

The booking wizard (F09) discovers slots only after the caller has
already committed to a specific patient + department + doctor + date +
type. That's the wrong shape for the ad-hoc workflow *"any doctor in
this department who has a 30-minute follow-up open tomorrow?"* — a
question that comes up when a patient calls in flexibly, when a
referral lands in a new department and the receiving NURSE needs to
scan their team's availability, or when an MRO wants to answer a
cross-department availability question without holding write
permissions.

The slot finder is the dedicated entry point for that workflow. It
ends in the booking wizard (deep-link with the slot pre-filled) so
the actual commit flow stays in one place; F15 is the *exploration*
surface that feeds it.

**Files expected to change**

Backend (`apps/api/`):

- `src/slots/slots.controller.ts` —
  - Update the permission gate to ALSO accept `schedule.read.all`
    (any-of with the existing `appointment.create.{own,own-department}`
    set). Use the `@RequirePermission()` decorator with the widened
    list.
  - Continue forwarding the same query shape; `doctorId` becomes
    optional in the DTO.
- `src/slots/dto/find-slots.query.dto.ts` —
  - `doctorId` becomes `@IsOptional()` (was required). The rest of the
    DTO is unchanged.
- `src/slots/slots.service.ts` —
  - When `doctorId` is omitted, fan out: load every doctor with an
    active `DoctorSchedule` in `departmentId` on the requested `date`,
    build each doctor's slot grid, merge, sort by `startAt`.
  - Existing scope enforcement applies per-doctor (so a NURSE asking
    for a foreign-dept's slots still gets `403 INSUFFICIENT_PERMISSION_SCOPE`).
  - Result rows carry `doctorId`, `doctorCode`, and the doctor's
    display name so the FE doesn't need a second lookup.
- `src/slots/slots.swagger.ts` —
  - Document the optional `doctorId` and the widened permission gate.
- `src/slots/slots.service.spec.ts` + `test/slots.e2e-spec.ts` —
  - New cases: omit-doctor multi-doctor merge, MRO with
    `schedule.read.all` succeeds (today returns 403), NURSE cross-dept
    rejection still fires.

Frontend (`apps/web/`):

- `src/app/[locale]/(app)/find-slot/page.tsx` (new) — server component:
  - Resolves view mode via the existing
    `resolveScheduleViewMode(session.user.permissionCodes)` helper.
    Forbidden card when null.
  - Renders a filter card (department / doctor / appointment type /
    date), a scope toggle in OWN_PLUS_DEPT, and a results list below.
  - URL state: `?scope=mine|dept`, `?departmentId=`, `?doctorId=`,
    `?type=`, `?date=YYYY-MM-DD`. Defaults: `scope=mine` (OWN_PLUS_DEPT),
    `date=today`, others empty.
  - Search button disabled until `type` is picked.
- `src/components/find-slot/` (new) —
  - `FindSlotFilterCard.tsx` — composes existing
    `<DepartmentSelect>` / `<DoctorSelect>` / `<AppointmentTypeSelect>` /
    date picker.
  - `FindSlotResultsList.tsx` — grouped by doctor, each row carries the
    "Book this slot" CTA.
  - `FindSlotScopeToggle.tsx` — `mine` / `dept` toggle for OWN_PLUS_DEPT.
- `src/lib/api/slots.api.ts` — extend to allow `doctorId` omitted in
  the typed call.
- `src/lib/api/slots.const.ts` — query-param constants.
- `src/types/slot.types.ts` — extend `SlotRow` with the new
  `doctorCode` + `doctorName` fields.
- `src/app-shell/nav-items.const.ts` — add a "Find slot" entry gated
  on any `schedule.read.*` code.
- `src/messages/{en,th}.json` — new `FindSlot.*` namespace; regenerate
  `i18n/keys.generated.ts`.
- `src/components/appointment/BookingWizard.tsx` — already reads
  `doctorScheduleId` / `startAt` / `appointmentType` / `departmentId`
  from search params (existing referral pickup path). Confirm the
  wizard locks each prefilled field and lands on the patient picker.
  If F09 doesn't already lock these fields, a minor update here is
  scoped into F15.

**Wire surface summary**

| Endpoint | Change | Auth |
| --- | --- | --- |
| `GET /slots?doctorId?=&departmentId=&date=&type=` | `doctorId` becomes optional; widened permission gate to also accept `schedule.read.all`. | `appointment.create.{own,own-department}` OR `schedule.read.all`. |

No new endpoints, no schema changes, no new permission codes.

**Migration / breaking-change notes**

- No DB migration. No schema changes.
- `GET /slots` `doctorId` becomes optional — backwards compatible
  (existing callers continue to pass it).
- Permission gate widens — backwards compatible (existing callers
  still authorised; MRO becomes newly authorised).

**Manual smoke test**

```bash
# 1. NURSE (DEPT view mode) finds open follow-up slots for today
#    across every doctor in their own department.
curl -s "http://localhost:3001/api/v1/slots?departmentId=<own>&date=2026-06-01&type=FOLLOW_UP" \
  -H "Cookie: next-auth.session-token=<nurse-jwt>" | jq

# 2. NURSE attempts cross-dept — rejected.
curl -i "http://localhost:3001/api/v1/slots?departmentId=<foreign>&date=2026-06-01&type=FOLLOW_UP" \
  -H "Cookie: next-auth.session-token=<nurse-jwt>"
# expect 403 INSUFFICIENT_PERMISSION_SCOPE

# 3. MRO (schedule.read.all, no appointment.create) — succeeds.
curl -s "http://localhost:3001/api/v1/slots?departmentId=<any>&date=2026-06-01&type=FOLLOW_UP" \
  -H "Cookie: next-auth.session-token=<mro-jwt>" | jq
# expect 200 with slot list

# 4. PHARMACY (no schedule.read.*) — rejected.
curl -i "http://localhost:3001/api/v1/slots?departmentId=<any>&date=2026-06-01&type=FOLLOW_UP" \
  -H "Cookie: next-auth.session-token=<pharmacy-jwt>"
# expect 403 INSUFFICIENT_PERMISSION
```

In the browser:

1. Sign in as `nurse1@gmail.com`. Open `/find-slot`. The page
   pre-pins the department to the caller's home. Pick `FOLLOW_UP` + today.
   Search lists open slots across multiple doctors. Click "Book this slot"
   → land on `/appointments/new` with everything locked except the
   patient picker.
2. Sign in as a seeded DOCTOR. Open `/find-slot`. Toggle defaults to
   `mine` — only the caller's own slots appear. Flip to `dept` —
   colleagues' slots appear; the doctor picker becomes available
   (scoped to the caller's dept).
3. Sign in as `records1@gmail.com` (MRO). Open `/find-slot`. The
   department picker is visible (ALL mode). The slot list renders
   without a "Book this slot" CTA — pure visibility.
4. Sign in as `pharmacy1@gmail.com`. The "Find slot" sidebar entry is
   hidden; direct-URL access to `/find-slot` returns the forbidden card.

---

### F18 — Doctor workspace + RBAC collapse of medical-records mutations (P1, L) ✅ shipped

**What actually shipped (delta from the brief below)**

The "Files expected to change" plan below is the original brief; the FE
landed differently after review feedback. The shipped shape:

- **The doctor surface is two dedicated routes, not an enhanced
  appointment detail.** `/appointments/:id` was reverted to its plain
  F09 read-only form (no doctor panels, no end-of-visit buttons — cancel
  only, for every role). The doctor's actionable view lives at a new
  **`/workspace/:id`** page, gated on `doctor_workspace.read.own` + a
  caller-is-the-doctor check, hosting the summary card, patient panel,
  medical-records history, and (while `BOOKED`) the note + actions panel.
- **`/workspace` lists two sections** — Upcoming (`BOOKED`, `from=today`,
  asc) and History (`COMPLETED` + `CANCELLED`, desc). Because the BE list
  endpoint filters one `status` at a time, History is two parallel calls
  merged + sorted client-side; each section paginates via its own query
  param (`upcomingPage` / `historyPage`). Rows reuse `AppointmentListRow`
  (arrow icon button + linked patient name; the date is NOT a link) and
  link to `/workspace/:id`.
- **`GET /patients/:id` was added** (gated on `patient.read`, `404
  PATIENT_NOT_FOUND` for unknown / soft-deleted) to feed the patient
  panel — the F09 patients controller only had `list` + `create`.
- **Medical-record cards show the authoring doctor + department.** The
  `GET /medical-records` response already returned both as nested refs;
  only the FE type was dropping them.
- **Past visits surface their records read-only.** The history component
  fetches by `appointmentGroupId` when grouped, else by `appointmentId`
  so a completed standalone visit still shows its own note.
- **Component naming:** the workspace note panel is `WorkspaceNotePanel`
  and the records list is `AppointmentVisitThread`; there is no separate
  `ReferDialog` — the refer modal is inlined in `WorkspaceNotePanel`. The
  legacy `AppointmentCompleteButton` / `AppointmentReferButton` /
  `AppointmentCloseCaseButton` components were deleted.

**Why a standalone feature**

This is the first feature whose write surface is built **for** doctors
rather than around them. F09 + F14 left doctors operating through the
generic `/appointments/:id` page with a loose cluster of three buttons
(Complete / Refer / Close Case) and a separately-POSTed medical record
endpoint. The split made every visit a multi-step ritual and let a
doctor close an appointment with no clinical note attached.

F18 collapses that surface into a single doctor workspace flow whose
note + drug fields are part of the visit-ending action body, then uses
the simplification to retire three permissions and two endpoints.
Bundling the RBAC delta with the workspace shipment keeps the
permission catalog in sync with what the code actually does.

**Files expected to change**

Backend (`apps/api/src/`):
- `auth/permissions.ts` — add `DOCTOR_WORKSPACE_READ_OWN`; remove
  `MEDICAL_RECORDS_CREATE_OWN`, `MEDICAL_RECORDS_UPDATE_OWN`,
  `MEDICAL_RECORDS_UPDATE_ALL`. `PERMISSION_CATALOG` length drops from
  35 to 33; update the description block at the head of the file.
- `auth/roles.ts` — DOCTOR baseline drops the two `medical_records.*`
  own perms and gains `doctor_workspace.read.own`; MRO baseline drops
  `medical_records.update.all`. Update the totals block in the
  doc-comment (50 → 48 policies, DOCTOR 15 → 14, MRO 9 → 8).
- `medical-records/medical-records.controller.ts` — delete the `POST /`
  and `PATCH /:id` routes (and their Swagger composites); keep
  `GET /` and `GET /:id`. The list endpoint gains an
  `appointmentGroupId?: string` query param.
- `medical-records/medical-records.service.ts` — delete `create()` and
  `update()`; extract the existing create-inside-transaction logic
  into an injectable helper (`createInsideTx(tx, …)`) the appointments
  service can call. List query consumes the new
  `appointmentGroupId` filter via nested
  `appointment: { appointmentGroupId: … }` Prisma where.
- `medical-records/medical-records.scope.ts` — delete; no scope
  resolvers remain after `update.*` is gone.
- `medical-records/dto/` — delete `create-medical-record.dto.ts` and
  `update-medical-record.dto.ts`; the list query DTO gains
  `appointmentGroupId?: string` (UUID).
- `appointments/appointments.controller.ts` — `complete` route body
  switches to `{ note: string, drug?: string }`; `refer` route body
  becomes `{ referredToDepartmentId, note: string, drug?: string }`;
  new route `POST /:id/follow-up` accepting
  `{ startAt: string, note: string, drug?: string }`. All three keep
  `@RequirePermission(PERMISSION.APPOINTMENT_UPDATE_OWN, …)` (no new
  permission). Swagger composites in `appointments.swagger.ts` updated
  alongside.
- `appointments/appointments.service.ts` — three call sites
  (`complete`, `refer`, new `followUp`) now wrap the work in a
  `$transaction(Serializable)` that also calls the medical-records
  helper. `complete` additionally updates `appointment_groups.closedAt`
  when `appointment.appointmentGroupId !== null`; the legacy F14
  `appointment-groups.service#close` becomes obsolete and is removed
  along with the route. `followUp` reuses the existing internal
  `create` path so per-(department, type) duration, booking-window,
  slot-conflict, and F14 group materialisation rules are honoured.
- `appointment-groups/appointment-groups.controller.ts` — remove the
  `POST /:id/close` route (and its Swagger composite + DTO).
  `appointment-groups.service.ts` — remove the `close()` method; the
  group's read-only inspector (if any) stays.
- `appointments/dto/` — add `complete-appointment.dto.ts`,
  `refer-appointment.dto.ts` (extends F14 shape with `note` + `drug`),
  `follow-up-appointment.dto.ts`. The three share a tiny base
  `medical-record-note.dto.ts` exporting `{ note: string; drug?: string }`
  if a base feels worth its weight; otherwise inline the two fields.
- `prisma/migrations/<timestamp>_f17_workspace_permissions/migration.sql`
  — forward migration: insert the new permission row + the new DOCTOR
  policy, then delete the dependent policy rows for the three retired
  permissions BEFORE deleting the permission rows themselves (the
  `policies.permission_id` FK is `ON DELETE NO ACTION`, so the policies
  must go first). The migration is idempotent (guards on `code` /
  `NOT EXISTS`; re-run safely after restore).
- `test/` — extend the appointment e2e suite with three new specs
  (`complete-with-note`, `refer-with-note`, `follow-up`) and a
  permission-catalog spec verifying the 33-perm / 48-policy totals.
  The medical-records e2e suite loses its create + update cases; the
  list spec gains an `appointmentGroupId` filter assertion.

Frontend (`apps/web/src/`):
- `auth/permissions.ts` — mirror the BE catalog delta. Add
  `DOCTOR_WORKSPACE_READ_OWN`; remove the three retired codes.
- `app-shell/nav-items.ts` (+ `.const.ts` / `.types.ts` as needed) —
  add a "Workspace" entry whose `visibleWhen` predicate checks for
  `doctor_workspace.read.own`.
- `app/[locale]/(app)/workspace/page.tsx` — server component that
  reads the session, asserts `doctor_workspace.read.own` (page guard),
  fetches today+future BOOKED appointments for the caller via the
  existing `listAppointments({ doctorId, status: BOOKED, from: today, order: asc })`
  helper, and renders rows linking to `/appointments/:id`.
- `app/[locale]/(app)/appointments/[id]/page.tsx` — split the
  existing detail card into a layout that conditionally renders the
  three new doctor-only panels (patient panel, visit-thread records,
  note + actions panel) when `me.doctor?.id === appointment.doctorId`.
  Remove the standalone Complete + Refer + Close Case buttons (the
  workspace actions replace them); keep the Cancel button.
- `components/appointment/AppointmentPatientPanel.tsx` — new,
  read-only patient demographic block.
- `components/appointment/AppointmentVisitThread.tsx` — new,
  read-only list of prior `MedicalRecord` rows in the same group;
  fetches via `listMedicalRecords({ appointmentGroupId })` with the
  `pageSize=all` sentinel.
- `components/appointment/WorkspaceNotePanel.tsx` — new "use client"
  form holding the required `note` textarea + optional `drug`
  textarea + three action buttons (Complete, Follow Up, Refer). The
  buttons are disabled until `note` is non-empty.
- `components/appointment/FollowUpDialog.tsx` — new, opens from the
  Follow Up button. Date picker → fetch
  `getSlots({ doctorId, departmentId, date, type: FOLLOW_UP })` →
  slot grid → Confirm. Confirms submit `{ startAt, note, drug }` to
  the new `followUpAppointment` server action.
- `components/appointment/ReferDialog.tsx` — existing modal updated
  to also pass `{ note, drug }` from the note panel.
- `components/appointment/AppointmentCompleteButton.tsx`,
  `AppointmentReferButton.tsx`, `AppointmentCloseCaseButton.tsx` —
  rewired into the workspace note panel rather than as standalone
  detail-page buttons; the legacy stand-alone exports are deleted.
- `lib/api/appointment.api.ts` + `.actions.ts` — three signatures
  updated to require `{ note, drug? }`; `followUpAppointment` action
  added; `closeAppointmentGroup` action deleted.
- `lib/api/medical-record.api.ts` — drop `createMedicalRecord` +
  `updateMedicalRecord`; add `appointmentGroupId` to
  `listMedicalRecords`.
- `messages/{en,th}.json` — new `Workspace.*`, `FollowUp.*`,
  `VisitThread.*` namespaces; regenerate `i18n/keys.generated.ts`.

**Migration / breaking-change notes**

- One forward migration adds the new permission + DOCTOR policy and
  deletes the three retired permission rows. Because the
  `policies.permission_id` FK is `ON DELETE NO ACTION`, the migration
  deletes the dependent DOCTOR / MRO policy rows explicitly first, then
  the permission rows. Apply with
  `pnpm --filter @hospital/api prisma migrate deploy`.
- `POST /medical-records` and `PATCH /medical-records/:id` are
  removed. No other in-tree consumer exists (the F08 e2e specs and
  the FE create+update flows are deleted alongside).
- `POST /appointment-groups/:id/close` is removed. F14's "close case"
  flow is fully subsumed by the new `complete` endpoint when the
  appointment carries an `appointmentGroupId`.

**Manual smoke test**

```bash
# Sign in as a seeded DOCTOR with at least one BOOKED appointment
# (use the F06 seed: any doctor01..doctor75 with an upcoming dated
#  schedule + a booking created via F09).

# Sidebar shows "Workspace"; the URL serves a queue.
open http://localhost:3000/en/workspace

# Open an appointment → write a note → click Complete.
# Inspect the appointment + medical_records + appointment_groups rows:
psql "$DATABASE_URL" -c "
  SELECT a.id, a.status, a.completed_at, a.appointment_group_id,
         g.closed_at,
         m.id AS medical_record_id, m.note
  FROM appointments a
  LEFT JOIN appointment_groups g ON g.id = a.appointment_group_id
  LEFT JOIN medical_records   m ON m.appointment_id = a.id
  WHERE a.id = '<appt-id>';
"
# Expect: status=COMPLETED, completed_at set, m.id present (one row),
# and (if the appointment was in a group) g.closed_at set.

# Follow Up path:
# Click Follow Up → pick date → pick slot → Confirm.
# Inspect:
psql "$DATABASE_URL" -c "
  SELECT id, status, appointment_type, appointment_group_id,
         previous_appointment_id, visit_number
  FROM appointments
  WHERE patient_id = '<patient-id>'
  ORDER BY start_at;
"
# Expect: original visit COMPLETED, new visit BOOKED w/ FOLLOW_UP +
# previous_appointment_id pointing at the original + same group_id.

# Refer path with empty note:
curl -i -X POST http://localhost:3001/api/v1/appointments/<id>/refer \
  -H "Cookie: next-auth.session-token=<jwt>" -H "Content-Type: application/json" \
  -d '{ "referredToDepartmentId": "<dept-b>", "note": "" }'
# Expect: 400 VALIDATION_FAILED.

# Retired endpoints:
curl -i -X POST http://localhost:3001/api/v1/medical-records ...    # → 404
curl -i -X PATCH http://localhost:3001/api/v1/medical-records/...   # → 404
curl -i -X POST http://localhost:3001/api/v1/appointment-groups/<id>/close ...   # → 404

# Sign in as records1@gmail.com (MRO) — any PATCH attempt on a
# medical record returns 404; GET still works.
```

---

## 4. Sequencing rationale

- **F01 → F02 → F03** is non-negotiable: schema (incl. RBAC tables and
  Doctor↔Department 1:1 via `User.departmentId`) before backend auth +
  permission guard, backend auth before frontend wiring.
- **F04, F10 are no longer in the pipeline.** Patient sign-in and
  patient self-service were scoped out, so F03 (sign-in) now feeds
  directly into F05 (directory) — there is no onboarding step between
  them.
- **F05 → F06 → F07 → F08 → F09** climbs the booking dependency tree:
  doctors/departments → schedules (with `departmentId`) → slot finder
  (validated against `department_appointment_types`) → medical records
  module (per-appointment clinical note) → front-desk booking +
  lifecycle.
- **F09** lands the front-desk booking + lifecycle surface in one PR.
  NURSE is the primary booker (`appointment.*.own-department`) and
  DOCTOR can act on their own appointments (`appointment.*.own`); ADMIN
  can opt in by self-granting via `role.update`. There is no follow-up
  "patient booking" feature to split out.
- **DOCTOR is a first-class clinical role** — it holds the full own-doctor
  CRUD bundle on schedules + appointments + medical records, plus
  `medical_records.read.all` for cross-coverage context. DOCTOR users are
  created via the admin invite path in F11, which also creates the
  linked `Doctor` row transactionally — there are no seeded DOCTOR rows
  in F01.
- **Scope semantics:** every CRUD permission carries a scope suffix
  (`.own` / `.own-department` / `.all`). The service layer narrows
  queries per the widest scope held for `(resource, verb)` via the
  per-verb scope resolvers in `apps/api/src/auth/scope.ts`. Definitions:
  - `schedule.X.own` → `schedule.doctorId === caller.doctor.id`.
  - `appointment.X.own` → `appointment.doctorId === caller.doctor.id`.
  - `medical_records.X.own` → `medical_records.doctorId === caller.doctor.id`.
  - `*.X.own-department` → row's `departmentId === caller.user.departmentId`.
  - `*.X.all` → no narrowing (cross-department access).
  Mixing scopes per verb is supported: DOCTOR's `schedule.read.own` +
  `schedule.read.own-department` widens reads to the department while
  keeping writes own-doctor only. The new `INSUFFICIENT_PERMISSION_SCOPE`
  error code surfaces when a caller holds a permission for the resource
  but not at the scope required by the request.
- **F11** absorbs the role/permission management surface in addition to
  user invite/disable, because the policy CRUD endpoints share the same
  ADMIN guard and the same UI shell. ADMIN starts narrow (9 user+role
  permissions) and tunes itself via `role.update` at runtime.
- **F11 and F12 are P1**: ship them if time allows; if not, document
  the gap in the README "deferred" section.

### Branching policy

- Feature PRs target `development` (NOT `main`). Roadmap §1 is the
  source of truth — `git log` history can be misleading if a feature
  was once squashed onto `main` directly.
