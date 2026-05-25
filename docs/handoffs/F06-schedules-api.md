# API Handoff: F06 — Doctor schedule CRUD (v2 — dated windows)

## Overview

F06 v2 rewrites the doctor schedule model from "recurring weekly templates"
(day-of-week + minutes-since-midnight + effective-from/until) to **concrete
dated availability windows**. Each row is one specific UTC start/end
datetime pair for one doctor in one department, with an optional break.
Schedules drive the appointment slot finder (F07) and the staff booking
flow (F08).

**Why the rewrite?** The recurring model required client-side expansion of
weekday templates × effective ranges to materialise a single calendar
date — and could not natively express one-off availability (e.g. a
substitution shift). Dated windows make the booking flow's overlap math a
direct timestamp comparison and let the slot finder stream rows ordered
by `startAt`.

**Auth model.** All endpoints require permission `schedule.manage`. STAFF
and DOCTOR hold it by the seed baseline; ADMIN does NOT. DOCTOR users are
additionally scope-restricted to their own `Doctor.id` at the service
layer — see [DOCTOR scope](#doctor-scope).

**Wire prefix.** All endpoints live under the global prefix `/api/v1`.
The FE proxies `/api/be/*` → `/api/v1/*`, so client code typically calls
`/api/be/schedules/...`.

## Endpoints

| Method | Path                       | Permission        | Notes                                  |
|--------|----------------------------|-------------------|----------------------------------------|
| GET    | `/api/v1/schedules`        | `schedule.manage` | Paginated list, filtered by range.     |
| GET    | `/api/v1/schedules/:id`    | `schedule.manage` | Detail; 404 on miss or DOCTOR scope.   |
| POST   | `/api/v1/schedules`        | `schedule.manage` | Create. 201 + `ScheduleResponse`.      |
| PATCH  | `/api/v1/schedules/:id`    | `schedule.manage` | Partial update. Re-validates merged.   |
| DELETE | `/api/v1/schedules/:id`    | `schedule.manage` | Soft-delete. 204, empty body.          |

## Request / response shapes

### `ScheduleResponse`

Returned by every list / get / create / update.

```jsonc
{
  "id": "fa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9",
  "doctorId": "4f3e2a10-1234-5678-9abc-deadbeef1234",
  "doctor": {
    "id": "4f3e2a10-1234-5678-9abc-deadbeef1234",
    "doctorCode": "MD-0001",
    "firstNameEn": "Anna",
    "lastNameEn": "Visit",
    "firstNameTh": null,
    "lastNameTh": null
  },
  "departmentId": "aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9",
  "department": {
    "id": "aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9",
    "name": "Cardiology",
    "description": "Heart, vasculature, and cardiovascular procedures."
  },
  "startAt": "2026-06-01T09:00:00.000Z",
  "endAt": "2026-06-01T12:00:00.000Z",
  "breakStartAt": "2026-06-01T10:30:00.000Z",
  "breakEndAt": "2026-06-01T11:00:00.000Z",
  "acceptsBooking": true,
  "createdAt": "2026-05-24T08:30:00.000Z",
  "updatedAt": "2026-05-24T08:30:00.000Z"
}
```

All datetimes are ISO 8601 UTC strings produced by `Date#toISOString()`.
`breakStartAt` / `breakEndAt` are `null` when no break is configured.
`department.description` is `null` when unset; `firstNameTh` /
`lastNameTh` are `null` when the user has no Thai name. The `Department`
model in P0 carries a single `name` column (English-only); Thai labels
ship with F12 i18n.

### `GET /api/v1/schedules`

Query string:

| Param          | Type                       | Required | Notes                                                                                  |
|----------------|----------------------------|----------|----------------------------------------------------------------------------------------|
| `page`         | int ≥ 1                    | no       | Default `1`.                                                                           |
| `pageSize`     | int 1..100                 | no       | Default `20`. Max `100`.                                                               |
| `doctorId`     | uuid                       | no       | Restrict to one doctor. DOCTOR callers may only set their own id (see scope).         |
| `departmentId` | uuid                       | no       | Restrict to one department.                                                            |
| `from`         | ISO date `YYYY-MM-DD`      | no       | Inclusive lower bound. See [Filter semantics](#filter-semantics).                      |
| `to`           | ISO date `YYYY-MM-DD`      | no       | Inclusive upper bound.                                                                 |

Returns `200 Paginated<ScheduleResponse>`:

```jsonc
{
  "data": [/* ScheduleResponse[] */],
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "totalPages": 3
}
```

Sort: `startAt ASC` (closest upcoming window first). The FE should NOT
re-sort unless changing the criterion.

### `GET /api/v1/schedules/:id`

Returns `200 ScheduleResponse`. Throws `404 SCHEDULE_NOT_FOUND` on unknown
or soft-deleted ids, AND for DOCTOR callers asking for a row owned by a
different doctor (no existence leak — 404 not 403).

### `POST /api/v1/schedules`

Body (`CreateScheduleDto`):

```jsonc
{
  "doctorId": "uuid",            // required, uuid
  "departmentId": "uuid",        // required, uuid
  "startAt": "ISO datetime",     // required, ISO 8601 UTC
  "endAt": "ISO datetime",       // required, ISO 8601 UTC, > startAt
  "breakStartAt": "ISO datetime", // optional; if set, breakEndAt also required
  "breakEndAt": "ISO datetime",   // optional; if set, breakStartAt also required
  "acceptsBooking": true         // optional, default true
}
```

Cross-field invariants (rejected `400 VALIDATION_FAILED` before any DB
work):

- `endAt > startAt`
- If either `breakStartAt` or `breakEndAt` is set, BOTH must be set
- `breakStartAt < breakEndAt`
- `breakStartAt >= startAt` AND `breakEndAt <= endAt`

Service-level invariants (rejected `409` after a DB read):

- Doctor must have an active `doctor_departments` row for `departmentId`
- The new window must not overlap any OTHER active schedule for the same
  `doctorId`. Overlap math is half-open: `a.startAt < b.endAt &&
  b.startAt < a.endAt`. Back-to-back windows (one ends at 12:00, next
  starts at 12:00) do NOT overlap.

Returns `201 ScheduleResponse`.

### `PATCH /api/v1/schedules/:id`

Body (`UpdateScheduleDto` — every field optional, no `doctorId`):

```jsonc
{
  "departmentId": "uuid",
  "startAt": "ISO datetime",
  "endAt": "ISO datetime",
  "breakStartAt": "ISO datetime",
  "breakEndAt": "ISO datetime",
  "acceptsBooking": true
}
```

`doctorId` is intentionally excluded — moving a schedule between doctors
is out of scope for F06 (would require re-validating affiliations + a
new audit trail). `departmentId` IS editable because doctors often pick
up a different department after the schedule was first created.

The service merges the patch over the existing row, then re-runs every
cross-field invariant AND the affiliation + overlap checks against the
merged shape. So a single-field edit (e.g. only `startAt`) is still
validated against every other existing schedule.

Returns `200 ScheduleResponse`.

### `DELETE /api/v1/schedules/:id`

Soft-delete (`deletedAt` + `deletedBy`). Returns `204` with an empty
body. Listing / GET will not return deleted rows; a follow-up DELETE on
the same id returns `404 SCHEDULE_NOT_FOUND` so the FE never thinks
"succeeded" for a row that was deleted by someone else in the interim.

Existing future appointments inside the deleted window are NOT
cancelled — they remain `BOOKED`. F08 surfaces the count in the UI.

## Error codes

All non-2xx responses use the shared envelope
`{ statusCode, code, message, details? }`.

| HTTP | `code`                          | When                                                                                         | `details` shape                                          |
|------|---------------------------------|----------------------------------------------------------------------------------------------|----------------------------------------------------------|
| 400  | `VALIDATION_FAILED`             | DTO shape or cross-field invariant fails on create / patch (incl. post-merge re-check).      | `{ errors: string[] }`                                   |
| 400  | `SCHEDULE_START_IN_PAST`        | `startAt` (post-merge on patch) is at or before `now`. Service-layer guard — DB CHECK cannot enforce. | `{ startAt: string, now: string }`                |
| 403  | `INSUFFICIENT_PERMISSION`       | Caller lacks `schedule.manage`.                                                              | `{ required: string[], held: string[] }`                 |
| 403  | `INSUFFICIENT_PERMISSION_SCOPE` | DOCTOR caller targets a foreign doctor on list (with `doctorId=`), create, patch, or delete. | none                                                     |
| 404  | `SCHEDULE_NOT_FOUND`            | Unknown id, soft-deleted, OR (for DOCTOR) a row owned by another doctor (get).               | none                                                     |
| 409  | `DOCTOR_NOT_IN_DEPARTMENT`      | `departmentId` is not in the doctor's active `doctor_departments`.                           | `{ doctorId, departmentId }`                             |
| 409  | `SCHEDULE_OVERLAP`              | The candidate window overlaps another active schedule for the same `doctorId`.               | `{ conflictingScheduleId: string }`                      |

Example (conflict):

```json
{
  "statusCode": 409,
  "code": "SCHEDULE_OVERLAP",
  "message": "Schedule conflicts with an existing active schedule for the same doctor.",
  "details": { "conflictingScheduleId": "aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9" }
}
```

## Filter semantics

`?from=&to=` are **calendar dates** (`YYYY-MM-DD`), expanded by the
service to UTC datetime bounds:

- `from` → `startOfDay(from)` = `<from>T00:00:00.000Z`
- `to` → `endOfDay(to)` = `<to>T23:59:59.999Z`

A schedule is included iff `[startAt, endAt)` intersects
`[startOfDay(from), endOfDay(to)]`:

```
include iff: startAt < endOfDay(to) && endAt > startOfDay(from)
```

**Default range.** When BOTH `from` and `to` are omitted, the service
defaults to the **current calendar month UTC** (1st 00:00:00 → last day
23:59:59.999). This keeps the FE's default landing page bounded — a
calendar page that doesn't pass a range will still produce a sensible
month of data.

When only one bound is provided, the missing side falls back to the
matching default-month edge:

- `?from=X` only → `[startOfDay(X), endOfMonth(now)]`
- `?to=Y` only → `[startOfMonth(now), endOfDay(Y)]`

The DTO accepts and rejects calendar dates via
`@Matches(/^\d{4}-\d{2}-\d{2}$/)` before any service work; malformed
input surfaces as `400 VALIDATION_FAILED`.

## DOCTOR scope

DOCTOR users (`roleCode === 'DOCTOR'`) are scope-restricted to their
own `Doctor.id` at the service layer. The FE does NOT need to filter or
guard on `doctorId` for DOCTOR pages — the BE will enforce / silently
narrow.

| Operation              | DOCTOR behavior                                                                                              |
|------------------------|--------------------------------------------------------------------------------------------------------------|
| `GET /schedules`       | Auto-filtered to `doctorId = caller.doctor.id`. Explicitly passing a different `?doctorId=` → 403 SCOPE.    |
| `GET /schedules/:id`   | Foreign id → 404 `SCHEDULE_NOT_FOUND` (no existence leak). Own id → 200.                                   |
| `POST /schedules`      | `doctorId` in body MUST equal `caller.doctor.id` → 403 SCOPE otherwise.                                    |
| `PATCH /schedules/:id` | Loads row first; foreign row → 403 SCOPE.                                                                  |
| `DELETE /schedules/:id`| Loads row first; foreign row → 403 SCOPE.                                                                  |

The `INSUFFICIENT_PERMISSION_SCOPE` code is distinct from the route-level
`INSUFFICIENT_PERMISSION` rejection so the FE can distinguish "you don't
have this permission at all" from "you have it but only for your own
data".

The DOCTOR caller's linked `Doctor.id` is loaded by the global JWT guard
from the user → doctor 1-1 join and surfaced as `caller.doctor.id`.
STAFF / ADMIN users always see `null` here.

The FE may consume `/me`'s new `doctor: { id } | null` field for UX
hints (e.g. "you're viewing your own schedule") but does NOT need to
attach it to outbound requests — the BE always re-resolves from the
session.

## Curl examples

Create:

```bash
curl -X POST http://localhost:3000/api/be/schedules \
  -H 'Content-Type: application/json' \
  -H 'Cookie: next-auth.session-token=<jwt>' \
  -d '{
    "doctorId": "4f3e2a10-1234-5678-9abc-deadbeef1234",
    "departmentId": "aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9",
    "startAt": "2026-06-01T09:00:00.000Z",
    "endAt": "2026-06-01T17:00:00.000Z",
    "breakStartAt": "2026-06-01T12:00:00.000Z",
    "breakEndAt": "2026-06-01T13:00:00.000Z"
  }'
```

List a calendar month for a single doctor:

```bash
curl -G http://localhost:3000/api/be/schedules \
  -H 'Cookie: next-auth.session-token=<jwt>' \
  --data-urlencode 'doctorId=4f3e2a10-1234-5678-9abc-deadbeef1234' \
  --data-urlencode 'from=2026-06-01' \
  --data-urlencode 'to=2026-06-30' \
  --data-urlencode 'page=1' \
  --data-urlencode 'pageSize=50'
```

List the current month with the default range (no filters):

```bash
curl http://localhost:3000/api/be/schedules \
  -H 'Cookie: next-auth.session-token=<jwt>'
```

Soft-delete:

```bash
curl -X DELETE http://localhost:3000/api/be/schedules/fa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9 \
  -H 'Cookie: next-auth.session-token=<jwt>'
```

## Integration notes

- **Pagination control**: same shared `<PaginationControl>` as F05;
  preserves filter query params on navigation.
- **Filter reset**: changing `doctorId` / `departmentId` / `from` / `to`
  MUST reset `page=1` so the user doesn't land on an empty page.
- **Optimistic UI**: NOT safe — every write may hit
  `DOCTOR_NOT_IN_DEPARTMENT` or `SCHEDULE_OVERLAP` that the FE cannot
  pre-validate (affiliations may change between page load and submit;
  overlap requires the full sibling set).
- **DOCTOR `/me/schedule`**: simply call `GET /schedules` with the
  desired `?from=&to=` — the BE will auto-scope to the caller's doctor.
- **Removed in v2**: no more `dayOfWeek`, `startMinute`, `endMinute`,
  `breakStartMinute`, `breakEndMinute`, `effectiveFrom`,
  `effectiveUntil`. Any FE code referencing those should switch to the
  new datetime fields.

## Backend-side schema / type changes (informational)

These changes shipped alongside F06 v2 and affect adjacent areas the FE
may consume:

- `DoctorSchedule` (DB + Prisma model) now carries `startAt` / `endAt` /
  `breakStartAt` / `breakEndAt` (`timestamptz(3)`) plus `acceptsBooking`
  and the standard audit cluster. Two CHECK constraints guard the
  invariants at the DB level (`doctor_schedules_end_after_start`,
  `doctor_schedules_break_valid`). A service-layer guard additionally
  rejects writes whose (post-merge) `startAt` is at or before `now`
  (`SCHEDULE_START_IN_PAST` — the DB has no `now` reference so this
  rule lives in the service).
- `AuthenticatedUser` (`/api/v1/me` response + `request.user`) carries
  `doctor: { id: string } | null` — populated only when the signed-in
  user has a linked `Doctor` row (DOCTOR role). STAFF / ADMIN see
  `null`. Consumed by the F06 scope guard but exposed for FE UX too.
- `acceptsBooking` (kept) is the F07 slot-finder gate: when `false`, the
  window is visible on the staff calendar but NOT bookable by patients
  (blocked / on-call / admin-only). The slot finder filters on
  `acceptsBooking=true`.
- `GET /departments/:id/doctors` has been **removed**. Use the canonical
  `GET /doctors?departmentId=<uuid>` instead — it already returns the
  doctor's full `departments[]` affiliation list (including `isPrimary`)
  so no information is lost.
- `GET /doctors` now accepts an optional `?q=<text>` query parameter — a
  case-insensitive substring filter matched against `firstNameEn`,
  `lastNameEn`, `firstNameTh`, `lastNameTh` (logical OR), and
  `doctorCode`. Whitespace is trimmed; empty / whitespace-only values are
  ignored; max length 100. Combines with `?departmentId=` via AND. Unblocks
  the FE doctor picker's server-side search ("Path A").
- `PaginationParams` (`apps/api/src/common/pagination/pagination.types.ts`)
  is the canonical service-layer args interface for paginated list
  endpoints. Every `List*Args` interface in a feature module extends it
  instead of re-declaring `page` / `pageSize`.
