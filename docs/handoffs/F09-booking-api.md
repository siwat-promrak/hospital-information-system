# API Handoff: F09 — Front-desk booking + appointment lifecycle

## Overview

F09 ships the BE half of the front-desk booking experience:

1. **`POST /patients`** — front-desk walk-in registration. `hn`
   (Hospital Number) is generated server-side as `<YY><sequence>`
   zero-padded to 8 characters.
2. **`GET /patients`** — paginated search across name (en/th), phone,
   identification number, and HN. Drives the booking wizard's "look
   up patient" panel.
3. **`POST /appointments`** — transactional booking at SERIALIZABLE
   isolation. Re-validates every invariant the F07 slot finder relied
   on (department/type allowance, schedule containment +
   `acceptsBooking`, break-window, slot collision) so a concurrent
   booker cannot slip between the finder's read and the insert.
4. **`GET /appointments`** — scope-narrowed paginated list with the
   filter axes the booking-board / queue / patient-detail views use.
5. **`GET /appointments/:id`** — detail with the same scope rules.
   Out-of-scope rows return 404 (no existence leak).
6. **`POST /appointments/:id/cancel`** — flips `status = CANCELLED`,
   records the cancel audit cluster, and frees the slot for immediate
   reuse.

**Auth model.** Each route is gated on the matching scope-aware
permission family:

| Endpoint                              | Permission(s)                                              | Default holders                              |
|---------------------------------------|------------------------------------------------------------|----------------------------------------------|
| `POST /patients`                      | `patient.create`                                           | NURSE, MEDICAL_RECORDS_OFFICER               |
| `GET /patients`                       | `patient.read`                                             | DOCTOR, NURSE, MEDICAL_RECORDS_OFFICER, PHARMACY |
| `POST /appointments`                  | `appointment.create.own` OR `appointment.create.own-department` | DOCTOR (`.own`), NURSE (`.own-department`) |
| `GET /appointments`                   | `appointment.read.{own\|own-department\|all}` (any)         | DOCTOR (`.own` + `.own-department`), NURSE (`.own-department`), MEDICAL_RECORDS_OFFICER (`.all`) |
| `GET /appointments/:id`               | same as list                                               | same                                         |
| `POST /appointments/:id/cancel`       | `appointment.delete.own` OR `appointment.delete.own-department` | DOCTOR (`.own`), NURSE (`.own-department`) |

Permission codes import from `apps/api/src/auth/permissions.ts`
(`PERMISSION.*`). Never hardcode the string literal — adding a new
catalog entry is a code change there + a seed re-run.

**Wire prefix.** All endpoints live under `/api/v1`. The FE proxies
`/api/be/*` → `/api/v1/*`, so client code typically calls
`/api/be/patients`, `/api/be/appointments`, …

**Important note on the booking transaction.** `POST /appointments`
runs inside `prisma.$transaction(callback, { isolationLevel:
'Serializable' })` and retries ONCE on Prisma's P2034 ("write conflict
or deadlock") code. The slot finder (F07) is NOT transactional — the
FE may surface `SLOT_TAKEN` (409) when a concurrent booker beats the
user to the punch; the recommended UX is "the slot was just claimed —
refresh the list" + re-issue `GET /slots`.

## Patients

### `PatientResponse`

```jsonc
{
  "id": "4f3e2a10-1234-5678-9abc-deadbeef9999",
  "hn": "26000011",
  "firstNameEn": "Praewa",
  "lastNameEn": "Boonmee",
  "firstNameTh": "แพรวา",
  "lastNameTh": "บุญมี",
  "email": "praewa@example.com",
  "dateOfBirth": "1990-01-15",
  "gender": "FEMALE",
  "bloodGroup": "O_POSITIVE",
  "identificationNo": "1100800123456",
  "phone": "+66-2-555-1234",
  "emergencyPersonName": "Anan Boonmee",
  "emergencyPersonRelation": "Spouse",
  "emergencyPersonPhone": "+66-2-555-9999",
  "address": "123 Example Road, Bangkok 10110",
  "createdAt": "2026-05-24T08:30:00.000Z",
  "updatedAt": "2026-05-24T08:30:00.000Z"
}
```

- `hn` matches `^[0-9]{7,9}$` (DB CHECK constraint). The mint generator
  pads to 8 characters.
- `dateOfBirth` is the ISO calendar date `YYYY-MM-DD` — the DB column
  is `Date` (no time-of-day component) and the BE never invents one.
- `email`, `firstNameTh`, `lastNameTh` may be `null`.
- `bloodGroup` defaults to `UNKNOWN` server-side when omitted on
  create.
- Audit columns (`createdBy`, `updatedBy`, `deletedAt`, …) are NOT on
  the wire.

### `POST /api/v1/patients`

Body (`CreatePatientDto`):

```jsonc
{
  "firstNameEn": "Praewa",                       // required, 1..200
  "lastNameEn": "Boonmee",                       // required, 1..200
  "firstNameTh": "แพรวา",                        // optional, max 200
  "lastNameTh": "บุญมี",                         // optional, max 200
  "email": "praewa@example.com",                 // optional, valid email
  "dateOfBirth": "1990-01-15",                   // required, YYYY-MM-DD
  "gender": "FEMALE",                            // required: MALE | FEMALE
  "bloodGroup": "O_POSITIVE",                    // optional; defaults UNKNOWN
  "identificationNo": "1100800123456",           // required, 1..64
  "phone": "+66-2-555-1234",                     // required, 1..64
  "emergencyPersonName": "Anan Boonmee",         // required, 1..200
  "emergencyPersonRelation": "Spouse",           // required, 1..200
  "emergencyPersonPhone": "+66-2-555-9999",      // required, 1..64
  "address": "123 Example Road"                  // required, 1..2000
}
```

Returns `201 PatientResponse`. The service mints `hn`, lowercases the
optional `email` via the shared `normalizeEmail()` helper, and stores
`createdBy = caller.id`. Duplicate email → `409 PATIENT_EMAIL_EXISTS`.

### `GET /api/v1/patients`

Query string:

| Param      | Type   | Required | Notes                                                                                       |
|------------|--------|----------|---------------------------------------------------------------------------------------------|
| `q`        | string | no       | Case-insensitive `contains` across name (en/th), phone, identification number, and HN.       |
| `page`     | int ≥ 1| no       | Default `1`.                                                                                |
| `pageSize` | int 1..500 OR `"all"` | no | Default `20`. See §8 (pagination).                                                          |

Returns `200 Paginated<PatientResponse>`. Sort: `createdAt DESC` (newest
first). Soft-deleted rows are excluded.

## Appointments

### `AppointmentResponse`

```jsonc
{
  "id": "7c8e2a10-1234-5678-9abc-deadbeefcafe",
  "patientId": "4f3e2a10-1234-5678-9abc-deadbeef9999",
  "doctorId": "4f3e2a10-1234-5678-9abc-deadbeef1234",
  "departmentId": "aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9",
  "scheduleId": "fa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9",
  "appointmentType": "CONSULTATION",
  "status": "BOOKED",
  "startAt": "2026-06-15T09:00:00.000Z",
  "endAt": "2026-06-15T09:20:00.000Z",
  "reason": null,
  "cancelledAt": null,
  "cancellationReason": null,
  "cancelledBy": null,
  "createdBy": "aa3d2f17-aaaa-4b4f-a3e8-31f2bbb55ccc",
  "createdAt": "2026-05-24T08:30:00.000Z",
  "updatedAt": "2026-05-24T08:30:00.000Z",
  "patient": {
    "id": "4f3e2a10-1234-5678-9abc-deadbeef9999",
    "hn": "26000011",
    "firstNameEn": "Praewa",
    "lastNameEn": "Boonmee",
    "firstNameTh": null,
    "lastNameTh": null
  },
  "doctor": {
    "id": "4f3e2a10-1234-5678-9abc-deadbeef1234",
    "doctorCode": "MD-0001",
    "firstNameEn": "Anan",
    "lastNameEn": "Charoen"
  },
  "department": {
    "id": "aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9",
    "name": "Cardiology"
  }
}
```

Notes:

- `appointmentType` is the Prisma enum (`NEW_PATIENT_VISIT` /
  `FOLLOW_UP` / `CONSULTATION` / `PROCEDURE`).
- `status` is the Prisma enum (`BOOKED` / `CANCELLED` / `COMPLETED`).
- `endAt = startAt + APPOINTMENT_TYPE_DURATION_MINUTES[appointmentType]`
  in ms (NEW_PATIENT_VISIT=30 / FOLLOW_UP=15 / CONSULTATION=20 /
  PROCEDURE=60).
- `reason`, `cancelledAt`, `cancellationReason`, `cancelledBy` may be
  `null` (they ARE `null` on every BOOKED row by definition).
- `scheduleId` is the F07 slot's owning `DoctorSchedule.id`, taken
  verbatim from `SlotResponse.scheduleId`.

### `POST /api/v1/appointments`

Body (`CreateAppointmentDto`):

```jsonc
{
  "patientId": "uuid",            // required
  "doctorId": "uuid",             // required
  "departmentId": "uuid",         // required — usually echoed from SlotResponse
  "scheduleId": "uuid",           // required — taken from SlotResponse
  "appointmentType": "CONSULTATION", // required, AppointmentType enum
  "startAt": "2026-06-15T09:00:00.000Z", // required, ISO 8601 UTC, taken from SlotResponse
  "reason": "Routine pacemaker check-up" // REQUIRED iff appointmentType === PROCEDURE; optional otherwise
}
```

- `endAt` is computed by the BE — never on the wire.
- `reason` is enforced via `@ValidateIf` on the DTO; sending an empty
  string for a PROCEDURE booking fails with
  `400 VALIDATION_FAILED`.
- The transaction order (inside SERIALIZABLE) is:
  1. `(department, type)` allowance,
  2. doctor exists + home-dept matches `departmentId`,
  3. patient exists,
  4. schedule exists + matches doctor/department + is bookable
     + slot sits inside the schedule window + slot doesn't cross the
     break,
  5. slot collision re-check against BOOKED/COMPLETED appointments,
  6. scope dispatch (matched after the invariants so the FE gets the
     "what's wrong with the payload" diagnostic before the
     permission error).

Returns `201 AppointmentResponse`.

### `GET /api/v1/appointments`

Query string:

| Param          | Type                  | Required | Notes                                                            |
|----------------|-----------------------|----------|------------------------------------------------------------------|
| `page`         | int ≥ 1               | no       | Default `1`.                                                     |
| `pageSize`     | int 1..500 OR `"all"` | no       | Default `20`.                                                    |
| `doctorId`     | uuid                  | no       | Restrict to one doctor.                                          |
| `patientId`    | uuid                  | no       | Restrict to one patient.                                         |
| `departmentId` | uuid                  | no       | Restrict to one department.                                      |
| `from`         | `YYYY-MM-DD`          | no       | Inclusive lower bound. Expanded to UTC start-of-day.              |
| `to`           | `YYYY-MM-DD`          | no       | Inclusive upper bound. Expanded to UTC end-of-day.                |
| `status`       | `AppointmentStatus`   | no       | One of `BOOKED` / `CANCELLED` / `COMPLETED`.                     |
| `order`        | `"asc"` \| `"desc"`   | no       | Sort direction for `startAt`. Default `asc`.                     |

Scope behavior:

- `appointment.read.all` (MRO) → no narrowing.
- `appointment.read.own-department` (NURSE) → `departmentId` is forced
  to the caller's `User.departmentId`. An explicit `?departmentId=<other>`
  returns `403 INSUFFICIENT_PERMISSION_SCOPE`.
- `appointment.read.own` (DOCTOR) → `doctorId` is forced to the
  caller's `Doctor.id`. An explicit `?doctorId=<other>` returns 403.

A DOCTOR who additionally holds `appointment.read.own-department`
(cross-coverage visibility, default in the seeded baseline) is
treated by the broader `.own-department` rule — the resolver prefers
the wider scope.

Returns `200 Paginated<AppointmentResponse>`.

### `GET /api/v1/appointments/:id`

Returns `200 AppointmentResponse`. Out-of-scope rows return
`404 APPOINTMENT_NOT_FOUND` so probing for foreign ids does not leak
existence.

### `POST /api/v1/appointments/:id/cancel`

Body (`CancelAppointmentDto`):

```jsonc
{
  "cancellationReason": "Patient no-show"   // optional, max 4000
}
```

Returns `200 AppointmentResponse` with `status = CANCELLED`, the
cancel-audit cluster populated, and the slot freed (CANCELLED rows do
NOT block subsequent slot bookings — re-booking the same `startAt`
succeeds immediately, see e2e coverage).

Already-CANCELLED rows → `409 APPOINTMENT_ALREADY_CANCELLED`.
Already-COMPLETED rows → `409 APPOINTMENT_ALREADY_COMPLETED`.

## Error codes

All non-2xx responses use the shared envelope
`{ statusCode, code, message, details? }`.

| HTTP | `code`                            | When                                                                                            |
|------|-----------------------------------|--------------------------------------------------------------------------------------------------|
| 400  | `VALIDATION_FAILED`               | DTO validation failed (incl. missing `reason` on PROCEDURE).                                     |
| 400  | `APPOINTMENT_START_IN_PAST`       | `startAt <= now()` at the moment the BE evaluates the booking.                                   |
| 400  | `DEPARTMENT_TYPE_NOT_ALLOWED`     | `(departmentId, appointmentType)` is not in `department_appointment_types`.                       |
| 400  | `DOCTOR_DEPARTMENT_MISMATCH`      | Doctor's current `User.departmentId` does not match the booking `departmentId`.                  |
| 400  | `SCHEDULE_NOT_FOUND_FOR_BOOKING`  | No active schedule matches `(scheduleId, doctorId, departmentId)`.                               |
| 400  | `SCHEDULE_NOT_BOOKABLE`           | Schedule exists but `acceptsBooking = false`.                                                    |
| 400  | `SLOT_OUTSIDE_SCHEDULE`           | Slot `[startAt, endAt)` is not contained in the schedule window.                                  |
| 400  | `SLOT_OVERLAPS_BREAK`             | Slot intersects the schedule's break window.                                                     |
| 403  | `INSUFFICIENT_PERMISSION`         | Caller is missing the required permission code.                                                  |
| 403  | `INSUFFICIENT_PERMISSION_SCOPE`   | Caller holds the permission but the target row / filter is outside their scope.                  |
| 404  | `NOT_FOUND`                       | Doctor or patient referenced from the booking payload is unknown / soft-deleted.                  |
| 404  | `APPOINTMENT_NOT_FOUND`           | Detail / cancel target is unknown OR out of scope (no existence leak on the GET path).            |
| 409  | `PATIENT_EMAIL_EXISTS`            | Another patient already owns the email.                                                          |
| 409  | `SLOT_TAKEN`                      | Another booker claimed the slot inside the transactional re-check window.                         |
| 409  | `APPOINTMENT_ALREADY_CANCELLED`   | Cancel target is already cancelled.                                                              |
| 409  | `APPOINTMENT_ALREADY_COMPLETED`   | Cancel target is already completed (cancel not allowed).                                          |

Most 400s and 409s carry a `details` object — see the individual code
in `apps/api/src/common/errors.ts` for the exact shape.

## Curl examples

Register a walk-in patient:

```bash
curl -X POST http://localhost:3000/api/be/patients \
  -H 'Content-Type: application/json' \
  -H 'Cookie: next-auth.session-token=<jwt>' \
  -d '{
    "firstNameEn": "Praewa",
    "lastNameEn": "Boonmee",
    "dateOfBirth": "1990-01-15",
    "gender": "FEMALE",
    "identificationNo": "1100800123456",
    "phone": "+66-2-555-1234",
    "emergencyPersonName": "Anan",
    "emergencyPersonRelation": "Spouse",
    "emergencyPersonPhone": "+66-2-555-9999",
    "address": "123 Example Road"
  }'
```

Search patients:

```bash
curl 'http://localhost:3000/api/be/patients?q=praewa&pageSize=20' \
  -H 'Cookie: next-auth.session-token=<jwt>'
```

Book an appointment (end-to-end happy path):

```bash
# 1. Get slots (F07).
curl '/api/be/slots?doctorId=<doc>&departmentId=<dept>&date=2026-06-15&type=CONSULTATION'

# 2. POST /appointments with the picked slot.
curl -X POST '/api/be/appointments' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: next-auth.session-token=<jwt>' \
  -d '{
    "patientId": "<patient>",
    "doctorId": "<doc>",
    "departmentId": "<dept>",
    "scheduleId": "<slot.scheduleId>",
    "appointmentType": "CONSULTATION",
    "startAt": "<slot.startAt>"
  }'

# 3. Cancel later.
curl -X POST '/api/be/appointments/<id>/cancel' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: next-auth.session-token=<jwt>' \
  -d '{ "cancellationReason": "Patient no-show" }'
```

## Integration notes for the FE wizard

- The wizard MUST thread `scheduleId` AND `departmentId` from the
  picked `SlotResponse` into the `POST /appointments` payload — the
  service re-validates both. `SlotResponse.scheduleId` is new in F09;
  see `docs/handoffs/F07-slots-api.md`.
- `endAt` is computed BE-side from `APPOINTMENT_TYPE_DURATION_MINUTES`
  — do NOT send it. The wizard may use the same map (already cached
  from `GET /appointment-types`) to render the slot duration label.
- The `reason` field is REQUIRED iff `appointmentType === PROCEDURE`.
  For the other three types, omit it or send `null`.
- On `409 SLOT_TAKEN` the FE should surface "another booker just
  claimed this slot" and re-issue `GET /slots` with the current
  `(doctor, department, date, type)` tuple.
- `403 INSUFFICIENT_PERMISSION_SCOPE` on the list / detail / cancel
  paths means the caller's role-scope does not cover the requested
  filter / target. The wizard should never trigger this for the
  happy-path booker user; surface as a generic "you don't have
  permission" toast.
- The list endpoint sorts by `startAt ASC` by default; pass
  `?order=desc` for "most recent first" views (e.g. the patient
  detail history panel).

## Backend-side schema / type changes (informational)

- **`Appointment.scheduleId`** is the new NOT NULL FK to
  `DoctorSchedule.id` (added in F08's schema bump; F09 is the first
  module to write through it on the front-desk path).
- **`SlotResponse.scheduleId`** is a new required field on the
  `GET /slots` wire — emitted by the same module as `departmentId`.
  See `docs/handoffs/F07-slots-api.md` (refreshed).
- **New error codes** in `apps/api/src/common/errors.ts`:
  `PATIENT_EMAIL_EXISTS`, `SLOT_TAKEN`, `SLOT_OUTSIDE_SCHEDULE`,
  `SLOT_OVERLAPS_BREAK`, `SCHEDULE_NOT_FOUND_FOR_BOOKING`,
  `SCHEDULE_NOT_BOOKABLE`, `APPOINTMENT_START_IN_PAST`,
  `APPOINTMENT_NOT_FOUND`, `APPOINTMENT_ALREADY_CANCELLED`,
  `APPOINTMENT_ALREADY_COMPLETED`.
- **No DB schema changes.** No new permissions.
