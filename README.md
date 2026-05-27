# Hospital Information System — Appointment Booking Module

**Author:** Siwat Promrak

A take-home implementation of the Appointment Booking Module described in the
spec. Delivered as a small full-stack project — NestJS + Prisma + Postgres on
the backend, Next.js App Router on the frontend — rather than API-only, so the
booking workflows can be exercised end-to-end. The functional scope (§1–§8 of
the spec) is the centre of gravity; everything else (auth, RBAC, i18n, admin
screens) exists only because the booking flow needs it.

If you only want the short version: jump to **[Quick start](#quick-start)** to
get it running, **[How to sign in](#how-to-sign-in)** to log in, and
**[Decisions & assumptions](#decisions--assumptions)** for the rationale
behind every choice the spec asked me to make.

---

## Stack

- **Backend:** [NestJS 10](apps/api) + [Prisma 5](apps/api/prisma/schema.prisma)
  + Postgres 16. Swagger at `/api/docs`.
- **Frontend:** [Next.js 15](apps/web) (App Router, React 19), MUI 6,
  next-intl (en + th), NextAuth v5 (Google provider).
- **Tooling:** pnpm workspaces, Turborepo, Docker Compose for Postgres,
  TypeScript everywhere, exact-pinned versions (see [CLAUDE.md §7](CLAUDE.md)).
- **Node:** ≥ 20. **pnpm:** 10.33.2 (Corepack-managed).

---

## Quick start

```bash
# 1. Install
pnpm install

# 2. Bring up Postgres (port 5434 → container 5432)
#    Requires a root .env — see "Local DB env" below.
pnpm db:up

# 3. Apply migrations + seed
pnpm --filter @hospital/api prisma migrate deploy
pnpm db:seed

# 4. Start both apps (API on :3001, web on :3000)
pnpm dev
```

Open **http://localhost:3000** (web) and **http://localhost:3001/api/docs**
(Swagger).

### Local DB env

The root `docker-compose.yml` is the production deployment file, so it expects
its DB credentials to come from a root `.env`. Create one with:

```env
# .env (repo root) — used only by docker compose
POSTGRES_USER=his
POSTGRES_PASSWORD=his
POSTGRES_DB=his
DB_PORT=5434
DOCKER_IMAGE=his-api:dev    # unused locally; set so compose doesn't error
```

The matching connection string is already pre-filled in
[apps/api/.env.example](apps/api/.env.example) and
[apps/web/.env.example](apps/web/.env.example) — copy each to `.env` next to
its example and you're done.

### Sanity check

```bash
pnpm type-check    # both apps
pnpm build         # both apps
pnpm test          # apps/api unit specs
```

---

## How to sign in

Authentication is Google OAuth via NextAuth v5; the backend resolves the
verified Google email against pre-seeded `users` rows. To sign in:

1. The Google account you use **must match a seeded email** (the resolve
   endpoint rejects unknown emails with `code=NOT_INVITED`).
2. The seeded emails are all `@gmail.com` aliases that don't correspond to
   real Google accounts. **For reviewers, the practical paths are:**
   - **Edit the seed** to use your own gmail before running `pnpm db:seed` —
     change one of the role-specific emails in
     [apps/api/prisma/seed/users.ts](apps/api/prisma/seed/users.ts) (NURSE is
     the easiest role to try because it owns the full booking flow), then
     reseed.
   - **Or skip the UI** and exercise the BE directly via Swagger
     (`/api/docs`) with a minted test JWT — see
     [apps/api/test/utils/sign-jwt.ts](apps/api/test/utils/sign-jwt.ts).

### Seeded users (per role)

| Role | Email | What they can do |
|---|---|---|
| ADMIN | `admin1@gmail.com`, `admin2@gmail.com` | Manage users / roles / policies |
| NURSE | `nurse1@gmail.com` | Department-scoped front-desk: books, manages patients + schedules, cancels |
| DOCTOR | `doctor01@gmail.com` … `doctor75@gmail.com` | Own-doctor schedules + appointments, writes medical records |
| MEDICAL_RECORDS_OFFICER | `records1@gmail.com` | Cross-department record/patient management |
| PHARMACY | `pharmacy1@gmail.com` | Cross-department read-only patients + records |

The full RBAC catalog (35 permissions, 50 default policies) is in
[apps/api/src/auth/permissions.ts](apps/api/src/auth/permissions.ts) and
[roles.ts](apps/api/src/auth/roles.ts).

---

## What's implemented vs the spec

Mapped one-to-one against the 8 functional requirements.

| Spec § | Requirement | Implementation |
|---|---|---|
| §1 | Doctor schedule (doctor, dept, day, start, end, break, accepts-booking) | `doctor_schedules` table + `/schedules` CRUD ([F06](docs/feature-roadmap.md)). Modelled as **dated windows** (`startAt`/`endAt` UTC) rather than recurring weekday templates — see [decision 1](#1-doctor-schedule-shape). |
| §2 | Book appointment with all listed fields | `/appointments` create endpoint ([F09](docs/feature-roadmap.md)). `departmentId` inherited from the chosen schedule for provenance. |
| §3 | Four appointment types with durations + rules | `AppointmentType` enum + per-`(department, type)` durations ([F13](docs/feature-roadmap.md)). See [decision 2](#2-appointment-type-durations--rules). |
| §4 | Find available slots by doctor + date + type | `GET /slots?doctorId=&departmentId=&date=&type=` ([F07](docs/feature-roadmap.md)) and a UI at `/find-slot` ([F15](docs/feature-roadmap.md)). Booked, break-window, past, and outside-hours slots are filtered out at the SQL+service layer. |
| §5 | Prevent invalid bookings (outside hours, break, overlap, past, unavailable schedule) | All five rejections + four extras: `DEPARTMENT_TYPE_NOT_ALLOWED`, `DOCTOR_DEPARTMENT_MISMATCH`, `APPOINTMENT_OUTSIDE_BOOKING_WINDOW`, `STANDALONE_APPOINTMENT_TYPE_INVALID`, `CONTINUATION_APPOINTMENT_TYPE_INVALID`. Enforced inside a `Serializable` transaction with one retry on `40001`. |
| §6 | Status (BOOKED, CANCELLED, COMPLETED) | `AppointmentStatus` enum on `appointments`. See [decision 3](#3-appointment-status--availability). |
| §7 | Cancel with reason + by + datetime | `POST /appointments/:id/cancel`. See [decision 4](#4-cancelled-slot-reusability). |
| §8 | Save data — explain choice | Postgres + Prisma. See [decision 5](#5-storage-choice). |

Beyond §1–§8 the project also delivers role resolution + sign-in, an admin
user/role management screen, a doctor workspace for completing visits, a
medical-records browser, an appointment-group / referral flow, and full
en/th i18n. None of that is required by the spec — it's included because the
booking workflow becomes meaningfully testable only once the surrounding
roles and audit trail exist. See [docs/feature-roadmap.md](docs/feature-roadmap.md)
for the full breakdown.

---

## Decisions & assumptions

The spec explicitly hands these calls to the implementer. For each one I
list the decision, the rationale, and the trade-off I'm aware of.

### 1. Doctor schedule shape

**Decision:** schedules are **dated UTC windows** (`startAt`/`endAt`
`timestamptz(3)`), not recurring weekday templates. Each row also carries an
optional break window (`breakStartAt`/`breakEndAt`) and an `acceptsBooking`
flag.

**Why:** one-off shifts (locum coverage, holiday closures, doctors moving
between departments) are first-class in clinic reality. With recurring
templates every cancellation or one-off shift becomes an exception row, and
the slot finder needs an expansion pass. Dated windows are flat to read,
flat to query (`startAt` BETWEEN), and trivially survive a doctor moving
departments — the row's `departmentId` is denormalised at write time so
historical schedules stay attributed to the department where they were
performed.

**Trade-off:** seeding three months of working hours requires multiple rows
per doctor. Mitigated by the seed orchestrator producing 2,700 schedule rows
(75 doctors × 3 weekdays × 12 weeks) automatically.

### 2. Appointment type durations & rules

**Decision:** four types as required, with these baseline durations:

| Type | Default duration | Notes |
|---|---|---|
| `NEW_PATIENT_VISIT` | 30 min | The **only** type that can start a clinical thread (standalone booking). |
| `FOLLOW_UP` | 15 min | Continuation only — must reference a `previousAppointmentId`. |
| `CONSULTATION` | 20 min | Continuation only (e.g. specialist sees a referred patient). |
| `PROCEDURE` | 60 min | Continuation only (longer block for clinical work). |

Per-(department, type) durations override the defaults via
`department_appointment_types.durationMinutes` (F13) — e.g. Orthopedics
PROCEDURE = 90 min, others unchanged.

**Booking time windows (F21).** Each `(department, type)` pair can also be
restricted to one or more local-time ranges per day. Windows live in a
child table `department_appointment_type_windows` (rather than a single
start/end column pair), so a pair can have **N disjoint daily ranges** —
all stored as wall-clock minute-of-day in `CLINIC_TIMEZONE`.

Concrete examples:

| (Department, Type) | Windows | Effect |
|---|---|---|
| Cardiology, `NEW_PATIENT_VISIT` | `09:00–11:00` | Slot grid only emits 09:00–11:00 slots; a 14:00 attempt → `400 APPOINTMENT_OUTSIDE_BOOKING_WINDOW`. |
| Internal Medicine, `FOLLOW_UP` | `09:00–11:00`, `15:00–17:00` | Morning OR afternoon clinic; the 11:30–14:30 gap is dead. |
| Orthopedics, `PROCEDURE` | `13:00–17:00` | Procedures booked afternoons only (matches the 90-min duration override). |
| Emergency Medicine, any | *(no rows)* | Unrestricted — bookable any time the doctor is on schedule. |

Containment is **whole-slot in any one range, OR semantics**: a slot must
sit entirely inside one window to be bookable. A 90-min `PROCEDURE` at
10:30–12:00 against a `09:00–11:00` window is rejected (the slot crosses
the boundary); the same window with an 09:00 start would be fine. Slots
that span local midnight count as ending at `1440`, not `0` — that kills a
whole class of day-rollover bugs (a 23:30 slot against a "before 11:00"
window is correctly excluded).

A single pure predicate `isSlotWithinBookingWindows(slotStart, slotEnd,
windows)` is shared by `SlotsService` (filters the grid) and
`AppointmentsService.create` (back-stops as
`APPOINTMENT_OUTSIDE_BOOKING_WINDOW`), so the slot finder and the create
endpoint can never disagree.

**Standalone vs continuation rule (added at F14/F16/F17 because the spec is
silent on it):** the `(previousAppointmentId, appointmentType)` pair forms a
complementary partition. A clinical thread starts with one
`NEW_PATIENT_VISIT` and continues with `FOLLOW_UP` / `PROCEDURE` /
`CONSULTATION` visits, grouped under an `appointment_groups` row. This makes
the BE the source of truth for "which type can start a case?" rather than
relying on FE UX to enforce it.

**Reason field:** stored as Postgres `text` (no length cap), **optional for
every type**. Clinical narrative belongs on the appointment's medical record
(authored by the doctor at visit-end), not on the booking row.

### 3. Appointment status & availability

**Decision:** three statuses (no extras added).

| Status | Blocks the slot? | When set |
|---|---|---|
| `BOOKED` | **Yes** | Default on creation. |
| `COMPLETED` | **Yes** | Set by the doctor's end-of-visit action (F18 workspace). A completed visit's slot is consumed history — it does not become bookable again. |
| `CANCELLED` | **No** | Frees the slot for immediate reuse — see [decision 4](#4-cancelled-slot-reusability). |

The slot finder excludes `BOOKED` and `COMPLETED` rows in the same SQL
query that emits the slot grid; `CANCELLED` rows are simply absent from the
blocking set. There is no soft-delete column on `appointments` — the
`status=CANCELLED` transition (with `cancelledBy` / `cancelledAt` /
`cancellationReason`) IS the audit-preserving tombstone.

### 4. Cancelled slot reusability

**Decision:** when an appointment is cancelled, **its slot becomes
available again immediately**. The cancellation row stays in the table with
the full audit triple (`cancelledBy`, `cancelledAt`, `cancellationReason`)
so the history is recoverable.

**Why:** clinic ops require slot reuse — a same-day cancel that locks the
slot would force the front desk into manual workarounds. Audit integrity is
preserved because nothing is deleted; the row is just no longer a "blocker"
in the slot-finder's filter set.

### 5. Storage choice

**Decision:** Postgres 16 + Prisma 5.

**Why:**
- Booking is a textbook serializability problem — overlapping `INSERT`s
  against the same doctor's calendar need a real DB transaction. The
  booking endpoint runs at isolation `Serializable` with one retry on
  Postgres error `40001`.
- Several invariants belong at the DB layer because they survive an
  out-of-band insert and aren't expressible from the application alone:
  `end_at > start_at` on appointments and schedules, break-window
  containment on schedules, HN format on patients. Postgres CHECK
  constraints back-stop all four (Prisma 5 can't express them natively,
  so they're appended as raw SQL to the init migration).
- Prisma's typed schema doubles as the single source of truth for both
  apps' wire types — no hand-rolled DTOs would catch a schema/code drift.
- Timestamps are `timestamptz(3)` UTC for **instants** (everything dated);
  per-(department, type) booking windows are stored as **local minute-of-day**
  in `CLINIC_TIMEZONE` (default `Asia/Bangkok`) because daily wall-clock
  boundaries don't survive a UTC date-line crossing. See
  [CLAUDE.md §9a](CLAUDE.md) for the full UTC-vs-local rule.

A document store would have made the multi-row booking transaction painful;
in-memory was rejected for the same reason.

---

## Out of scope / known limitations

Things I consciously chose **not** to implement (the spec invites this with
*"simplify areas you think are out of scope"*):

- **Recurring schedule templates.** Each schedule row is a concrete dated
  window — see [decision 1](#1-doctor-schedule-shape).
- **Multi-tenant clinics.** Single-clinic deployment, single
  `CLINIC_TIMEZONE`.

Known follow-ups tracked in [docs/follow-ups.md](docs/follow-ups.md):

- **FU-01** — Auth.js v5 session JWT is HS256-signed JWS today; should
  migrate to JWE (encrypted) so cookie claims are no longer plaintext.

---

## Project layout

```
hospital-information-system/
├── apps/
│   ├── api/                NestJS + Prisma backend (port 3001)
│   │   ├── prisma/         schema.prisma, migrations, per-table seed
│   │   └── src/
│   │       ├── auth/       AuthN/Z, RBAC catalog, guards
│   │       ├── appointments/  booking, lifecycle, cancellation
│   │       ├── schedules/  doctor schedules CRUD
│   │       ├── slots/      slot finder
│   │       ├── medical-records/, doctors/, departments/, patients/
│   │       └── common/     pagination, error envelope, dayjs setup
│   └── web/                Next.js App Router (port 3000)
│       └── src/
│           ├── app/[locale]/(app)/      protected pages (sidebar layout)
│           ├── components/<entity>/     entity-scoped UI
│           └── lib/api/                 server-side fetch helpers
├── docs/
│   ├── user-stories.md     full P0/P1 spec (E1–E20)
│   ├── feature-roadmap.md  per-PR delivery plan with smoke tests
│   ├── handoffs/           BE→FE API handoff docs (F06/F07/F09)
│   └── follow-ups.md       deferred work
├── CLAUDE.md               project standards (code style, RBAC, dayjs, etc.)
├── docker-compose.yml      Postgres (and prod API image)
└── package.json            pnpm workspaces + Turborepo
```

---

## Testing

```bash
# Backend unit specs
pnpm --filter @hospital/api test

# Backend e2e (auth + booking flows)
pnpm --filter @hospital/api test:e2e

# Type-check both apps
pnpm type-check
```

The booking + slot-finder logic is covered by unit specs at
[apps/api/src/slots/](apps/api/src/slots/) and
[apps/api/src/appointments/](apps/api/src/appointments/), and by an e2e
suite at [apps/api/test/](apps/api/test/) that exercises the full
sign-in → book → cancel chain.

---

## Where to dig deeper

- Per-feature delivery breakdown + smoke tests:
  [docs/feature-roadmap.md](docs/feature-roadmap.md)
- Full user stories with acceptance criteria (E1 data model through E20
  patients directory): [docs/user-stories.md](docs/user-stories.md)
- BE wire contracts for the booking-critical endpoints:
  [docs/handoffs/F06-schedules-api.md](docs/handoffs/F06-schedules-api.md),
  [F07-slots-api.md](docs/handoffs/F07-slots-api.md),
  [F09-booking-api.md](docs/handoffs/F09-booking-api.md)
- Code-style + RBAC + dayjs conventions: [CLAUDE.md](CLAUDE.md)
