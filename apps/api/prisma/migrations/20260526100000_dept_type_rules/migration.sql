-- F13 — Per-(department, type) booking rules.
--
-- Move the per-`AppointmentType` slot duration off the global const map
-- (`APPOINTMENT_TYPE_DURATION_MINUTES`) onto a per-pair column on
-- `department_appointment_types`, and add a nullable wall-clock booking
-- window (`booking_window_start_minute` / `booking_window_end_minute` —
-- minute-of-day in `CLINIC_TIMEZONE`, per CLAUDE.md §9a).
--
-- The migration is additive on top of `_init` + `_f08_*`:
--   1. Add `duration_minutes INT NOT NULL DEFAULT 0`.
--   2. Backfill per `appointment_type` from the prior const map.
--   3. Drop the temporary DEFAULT so future inserts must supply a value.
--   4. Add the two nullable booking-window columns.
--   5. Append the three raw-SQL CHECK constraints (Prisma 5 cannot
--      express them natively, per the F01 pattern).

-- 1. Required duration column with a placeholder default for backfill.
ALTER TABLE "department_appointment_types"
  ADD COLUMN "duration_minutes" INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill the per-type defaults the global const map carried before
--    F13 (NEW_PATIENT_VISIT=30, FOLLOW_UP=15, CONSULTATION=20,
--    PROCEDURE=60). Seed-time overrides land later via the upsert in
--    `apps/api/prisma/seed/department-appointment-types.ts`.
UPDATE "department_appointment_types"
  SET "duration_minutes" = 30
  WHERE "appointment_type" = 'NEW_PATIENT_VISIT';

UPDATE "department_appointment_types"
  SET "duration_minutes" = 15
  WHERE "appointment_type" = 'FOLLOW_UP';

UPDATE "department_appointment_types"
  SET "duration_minutes" = 20
  WHERE "appointment_type" = 'CONSULTATION';

UPDATE "department_appointment_types"
  SET "duration_minutes" = 60
  WHERE "appointment_type" = 'PROCEDURE';

-- 3. Drop the temporary DEFAULT so new rows must supply an explicit
--    duration.
ALTER TABLE "department_appointment_types"
  ALTER COLUMN "duration_minutes" DROP DEFAULT;

-- 4. Optional booking window — wall-clock minute-of-day in
--    `CLINIC_TIMEZONE`. NULL on either side = open-ended on that side.
ALTER TABLE "department_appointment_types"
  ADD COLUMN "booking_window_start_minute" INTEGER NULL,
  ADD COLUMN "booking_window_end_minute" INTEGER NULL;

-- 5. Domain invariants — Prisma 5 cannot express CHECK constraints.

-- duration_minutes is positive and never exceeds an 8h cap (sanity
-- ceiling — the longest legitimate slot today is 90 min).
ALTER TABLE "department_appointment_types"
  ADD CONSTRAINT "department_appointment_types_duration_positive"
  CHECK ("duration_minutes" > 0 AND "duration_minutes" <= 480);

-- Each minute-of-day lives in its half-open daily range. `start` is the
-- inclusive lower bound so [0, 1440) is the legal interval; `end` is the
-- exclusive upper bound so (0, 1440] is the legal interval.
ALTER TABLE "department_appointment_types"
  ADD CONSTRAINT "department_appointment_types_window_bounds"
  CHECK (
    (
      "booking_window_start_minute" IS NULL
      OR (
        "booking_window_start_minute" >= 0
        AND "booking_window_start_minute" < 1440
      )
    )
    AND (
      "booking_window_end_minute" IS NULL
      OR (
        "booking_window_end_minute" > 0
        AND "booking_window_end_minute" <= 1440
      )
    )
  );

-- When BOTH bounds are set the start strictly precedes the end so the
-- window is non-empty.
ALTER TABLE "department_appointment_types"
  ADD CONSTRAINT "department_appointment_types_window_order"
  CHECK (
    "booking_window_start_minute" IS NULL
    OR "booking_window_end_minute" IS NULL
    OR "booking_window_start_minute" < "booking_window_end_minute"
  );
