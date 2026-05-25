# API Handoff: F07 — Appointment types + slot finder

## Overview

F07 ships the two backend surfaces the F08 booking wizard consumes:

1. **`GET /appointment-types`** — the canonical catalog of
   `AppointmentType` enum values, each paired with its English label and
   slot duration (minutes). Static per-deploy; the duration map lives in
   application code (`appointment-types.const.ts`), not the database.
2. **`GET /slots`** — the deterministic slot finder. Given a
   `(doctor, department, date, appointmentType)` tuple, returns the
   chronologically-sorted open slots a STAFF user could book. All four
   dimensions are mandatory query params.

Both endpoints are **NURSE-only by default** (permission
`appointment.create.own-department`). ADMIN, MEDICAL_RECORDS_OFFICER,
and PHARMACY do NOT hold that permission in the seeded baseline; any of
them that needs to probe these endpoints must first self-grant via
`permission.assign` (US-11.5). DOCTOR also lacks the permission — these
are booker-side surfaces, not schedule-management.

**Scope: own-department only.** Because the permission carries an
`.own-department` suffix, the slot finder additionally rejects requests
that cross a department boundary. A NURSE in department A asking for
slots in department B receives `403 INSUFFICIENT_PERMISSION_SCOPE` (NOT
`200 []` and NOT `404`) — the caller holds the permission but the scope
forbids the query. See the error table below for the exact `details`
payload.

**Wire prefix.** All endpoints live under the global prefix `/api/v1`.
The FE proxies `/api/be/*` → `/api/v1/*`, so client code typically calls
`/api/be/appointment-types` and `/api/be/slots`.

**Important note for F08:** the slot finder is the single source of truth
for "is this time bookable?" but it does NOT run inside a transaction —
F08's `POST /appointments` MUST re-validate the slot inside its
serializable transaction to defend against races. The finder is fast
enough to be safely polled from the FE while the user clicks around the
day picker.

## Endpoints

| Method | Path                          | Permission           | Notes                                                                                  |
|--------|-------------------------------|----------------------|----------------------------------------------------------------------------------------|
| GET    | `/api/v1/appointment-types`   | `appointment.create.own-department` | Static catalog. `[{ code, label, durationMinutes }] × 4`.                              |
| GET    | `/api/v1/slots`               | `appointment.create.own-department` | Slot grid for one `(doctor, department, date, type)` tuple. Flat array, no envelope.   |

Both endpoints return a flat JSON array. There is no `Paginated<T>`
envelope here: the appointment-types catalog is 4 rows by definition, and
the slot finder is dimension-locked on a single day for a single doctor
(rarely produces more than a few dozen entries).

## Request / response shapes

### `AppointmentTypeResponse`

The wire row for `GET /appointment-types`:

```jsonc
{
  "code": "CONSULTATION",                // AppointmentType enum (Prisma)
  "label": "Consultation",                // English label (BE returns en-only)
  "durationMinutes": 20                   // Slot length AND grid step in F07
}
```

`code` values are the four Prisma `AppointmentType` enum members
(`NEW_PATIENT_VISIT`, `FOLLOW_UP`, `CONSULTATION`, `PROCEDURE`).
`durationMinutes` is the canonical per-type map:

| `code`              | `durationMinutes` |
|---------------------|-------------------|
| `NEW_PATIENT_VISIT` | 30                |
| `FOLLOW_UP`         | 15                |
| `CONSULTATION`      | 20                |
| `PROCEDURE`         | 60                |

The catalog is returned in this exact order (matching the Prisma enum
declaration). Labels are English; the FE re-keys them through
`Common.AppointmentType.<code>` for Thai parity in F12.

### `GET /api/v1/appointment-types`

No query params. Returns `200 AppointmentTypeResponse[]`:

```jsonc
[
  { "code": "NEW_PATIENT_VISIT", "label": "New patient visit", "durationMinutes": 30 },
  { "code": "FOLLOW_UP", "label": "Follow-up", "durationMinutes": 15 },
  { "code": "CONSULTATION", "label": "Consultation", "durationMinutes": 20 },
  { "code": "PROCEDURE", "label": "Procedure", "durationMinutes": 60 }
]
```

### `SlotResponse`

The wire row for `GET /slots`:

```jsonc
{
  "startAt": "2026-06-15T09:00:00.000Z",  // ISO 8601 UTC, inclusive
  "endAt": "2026-06-15T09:20:00.000Z",    // ISO 8601 UTC, exclusive
  "departmentId": "aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9",
  "scheduleId": "fa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9"
}
```

- `endAt - startAt === APPOINTMENT_TYPE_DURATION_MINUTES[type]` in
  milliseconds.
- `departmentId` is echoed verbatim from the schedule that produced the
  slot — the F09 booker MUST pass it back when calling
  `POST /appointments` (the spec mandates `Appointment.departmentId` is
  inherited from the chosen schedule, NOT looked up from the doctor).
- `scheduleId` is the owning `DoctorSchedule.id` — the F09 booker MUST
  pass it back so the new `Appointment.scheduleId` FK is populated. The
  booking endpoint loads the schedule by id to re-validate slot
  containment and the `acceptsBooking` flag inside its transaction.

### `GET /api/v1/slots`

Query string (ALL params REQUIRED):

| Param          | Type                       | Required | Notes                                                                                |
|----------------|----------------------------|----------|--------------------------------------------------------------------------------------|
| `doctorId`     | uuid                       | yes      | The slot finder is locked to one doctor per call.                                    |
| `departmentId` | uuid                       | yes      | The slot finder only considers schedules whose `departmentId` matches.               |
| `date`         | ISO date `YYYY-MM-DD`      | yes      | Interpreted as a UTC calendar day.                                                   |
| `type`         | `AppointmentType` enum     | yes      | Drives the slot grid step. The `(departmentId, type)` pair must be allowed (below).  |

Returns `200 SlotResponse[]` in chronological order (`startAt ASC`). May
be empty. **`GET` of a fully-past `date` returns `200 []`, never `400`**
(US-6.2).

## Slot-grid algorithm

For each active (non-soft-deleted, `acceptsBooking = true`)
`DoctorSchedule` matching `doctorId` + `departmentId` whose
`[startAt, endAt)` intersects the requested UTC day:

1. **Step** `[scheduleStartAt, scheduleEndAt)` by
   `APPOINTMENT_TYPE_DURATION_MINUTES[type]`. Each step yields a
   candidate slot `[step, step + duration)`.
2. **Drop trailing partial**: the last step is included only if
   `slotEnd <= scheduleEndAt` (half-open).
3. **Exclude break overlap**: when the schedule has a break window, drop
   slots whose `[startAt, endAt)` intersects
   `[breakStartAt, breakEndAt)`. Overlap is half-open
   (`a.startAt < b.endAt && b.startAt < a.endAt`); back-to-back slots do
   NOT overlap.
4. **Exclude past slots**: drop slots whose `startAt <= now` (server
   `dayjs.utc()`).
5. **Exclude blocking appointments**: drop slots that overlap any
   non-soft-deleted appointment on the same doctor that day with `status
   IN ('BOOKED', 'COMPLETED')`. **`CANCELLED` appointments do NOT
   block** — the slot is immediately re-bookable (US-6.2).

When the doctor has multiple schedules on the same day (rare but
allowed), each contributes its own slot list and the merged output is
sorted by `startAt ASC`. Across multiple schedules with different
departments, the slot finder only returns slots from schedules whose
`departmentId` matches the query.

## Error codes

All non-2xx responses use the shared envelope
`{ statusCode, code, message, details? }`.

| HTTP | `code`                        | When                                                                                                          | `details` shape                                              |
|------|-------------------------------|---------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------|
| 400  | `VALIDATION_FAILED`           | Missing / malformed query param (uuid format, calendar-date shape, enum membership).                          | `{ errors: string[] }`                                       |
| 400  | `DEPARTMENT_TYPE_NOT_ALLOWED` | `(departmentId, type)` is not in `department_appointment_types`.                                              | `{ departmentId: string, appointmentType: AppointmentType }` |
| 403  | `INSUFFICIENT_PERMISSION`     | Caller lacks `appointment.create.own-department`.                                                                            | `{ required: string[], held: string[] }`                     |
| 403  | `INSUFFICIENT_PERMISSION_SCOPE` | Caller holds `appointment.create.own-department` but `departmentId` is not the caller's own department.       | `{ required: ['appointment.create.own-department'], scope: 'own-department', requestedDepartmentId: string }` |
| 404  | `NOT_FOUND`                   | Doctor id is unknown or soft-deleted.                                                                          | none                                                         |

**Notes:**

- The slot finder does NOT 404 on an unknown `departmentId` — that
  surfaces as `400 DEPARTMENT_TYPE_NOT_ALLOWED` (no allowed-type row for
  the missing department).
- An unknown `(departmentId, type)` pair is `400`, not `409`, because it
  is a request-shape error, not a write conflict.
- A fully-past `date` does NOT error — the response is `200 []`.

Example (`DEPARTMENT_TYPE_NOT_ALLOWED`):

```json
{
  "statusCode": 400,
  "code": "DEPARTMENT_TYPE_NOT_ALLOWED",
  "message": "Department does not offer this appointment type.",
  "details": {
    "departmentId": "aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9",
    "appointmentType": "PROCEDURE"
  }
}
```

## Curl examples

List appointment types:

```bash
curl http://localhost:3000/api/be/appointment-types \
  -H 'Cookie: next-auth.session-token=<jwt>'
```

Find slots for one doctor in one department:

```bash
curl -G http://localhost:3000/api/be/slots \
  -H 'Cookie: next-auth.session-token=<jwt>' \
  --data-urlencode 'doctorId=4f3e2a10-1234-5678-9abc-deadbeef1234' \
  --data-urlencode 'departmentId=aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' \
  --data-urlencode 'date=2026-06-15' \
  --data-urlencode 'type=CONSULTATION'
```

Find slots for the F08 wizard happy path:

```bash
# 1. Get types → render picker.
curl /api/be/appointment-types

# 2. Pick `CONSULTATION` (20 min). Find slots.
curl '/api/be/slots?doctorId=<doctor>&departmentId=<dept>&date=2026-06-15&type=CONSULTATION'

# 3. POST /appointments (F08) passing back `startAt` + `departmentId` from
#    the picked slot. The booking endpoint re-validates inside a
#    Serializable transaction.
```

## Integration notes for F08

- The wizard passes `doctorId` in the query string (alongside
  `departmentId` / `date` / `type`) — the slot finder treats all four
  filters as peer mandatory dimensions, none nested in the URL path.
- The wizard must thread `departmentId` from step 2 (department picker)
  through the slot finder AND into `POST /appointments`. The slot
  finder's `departmentId` response field is the source of truth.
- The wizard must call `GET /appointment-types` once at mount and cache
  the `durationMinutes` map — F08 will need the duration to compute
  `endAt` on the booking payload if the BE expects a duration override
  (it currently does not; `POST /appointments` computes `endAt` from the
  same map). Refresh on page reload, not per-call.
- **Race condition:** the finder is not transactional. The window
  between "user clicks slot" and "POST /appointments lands" can be
  several seconds; F08's transaction handles the race with
  `SLOT_TAKEN` on collision. The FE should surface `SLOT_TAKEN` as
  "another booker just claimed this slot — refresh and pick another"
  and re-fetch the slot list.
- **Filter reset:** changing `doctorId` / `departmentId` / `date` /
  `type` MUST re-issue a fresh `GET /slots` and discard the previous
  selection — a slot from a different `(doctor, department, date, type)`
  tuple is semantically a different object.
- The FE may render `acceptsBooking=false` schedules on the calendar
  (US-5.1) but their slots will NEVER appear from this endpoint —
  `acceptsBooking` is the F07 gate. The schedule list endpoint surfaces
  the flag; the slot finder filters on it.

## Backend-side schema / type changes (informational)

- **New error code** in the shared catalog
  (`apps/api/src/common/errors.ts`):
  `DEPARTMENT_TYPE_NOT_ALLOWED = 'DEPARTMENT_TYPE_NOT_ALLOWED'`. Used
  by this feature only today; F08 will reuse it on booking when the
  pair is not allowed.
- **New module** `apps/api/src/appointment-types/` exposes the typed
  duration map (`APPOINTMENT_TYPE_DURATION_MINUTES` keyed by the Prisma
  enum) so F08's booking service can compute `endAt` without rewriting
  the map.
- **New module** `apps/api/src/slots/` carries the slot computation +
  exposes a public service (`SlotsService.findSlots`) F08 may
  optionally call to share the algorithm (today it owns the
  read-the-grid logic; F08 will own the transactional re-validation).
- No DB schema changes. No new permissions. The seed already has the
  per-department `department_appointment_types` matrix needed to
  exercise the new endpoint.
