-- F21 — Multi-range booking windows.
--
-- Replaces F13's single nullable booking-window pair
-- (`booking_window_start_minute` / `booking_window_end_minute`) on
-- `department_appointment_types` with a child table
-- `department_appointment_type_windows`.  Each row is one allowed
-- wall-clock range [start_minute, end_minute) in CLINIC_TIMEZONE.
-- Zero rows for a pair = unrestricted (same semantics as both columns
-- being NULL under F13).
--
-- Steps:
--   1. CREATE the child table with a per-row CHECK.
--   2. Data-migrate existing single-window rows into child rows.
--   3. Drop the two old columns + their F13 CHECK constraints.
--
-- Forward-only migration.

-- 1. Create the child table.
--    `department_appointment_type_id` FK → `department_appointment_types(id)`
--    with onDelete NO ACTION (match repo convention — hard deletes are
--    blocked at the service layer, not via CASCADE).
CREATE TABLE "department_appointment_type_windows" (
  "id"                              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "department_appointment_type_id"  UUID        NOT NULL,
  "start_minute"                    INTEGER     NOT NULL,
  "end_minute"                      INTEGER     NOT NULL,
  "created_at"                      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "created_by"                      UUID        NOT NULL,
  "updated_at"                      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_by"                      UUID,
  "deleted_at"                      TIMESTAMPTZ(3),
  "deleted_by"                      UUID,

  CONSTRAINT "department_appointment_type_windows_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "department_appointment_type_windows_dat_id_fkey"
    FOREIGN KEY ("department_appointment_type_id")
    REFERENCES "department_appointment_types" ("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,

  CONSTRAINT "department_appointment_type_windows_created_by_fkey"
    FOREIGN KEY ("created_by")
    REFERENCES "users" ("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,

  CONSTRAINT "department_appointment_type_windows_updated_by_fkey"
    FOREIGN KEY ("updated_by")
    REFERENCES "users" ("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,

  CONSTRAINT "department_appointment_type_windows_deleted_by_fkey"
    FOREIGN KEY ("deleted_by")
    REFERENCES "users" ("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,

  -- Per-row domain invariant: a range must be non-empty and within the daily
  -- [0, 1440] span. endMinute = 1440 means "until local midnight".
  CONSTRAINT "department_appointment_type_windows_bounds"
    CHECK (
      "start_minute" >= 0
      AND "start_minute" < "end_minute"
      AND "end_minute" <= 1440
    )
);

-- 2. Data-migrate existing single-window rows.
--    For each `department_appointment_types` row that had at least one
--    non-NULL bound, insert one child row:
--      start_minute = COALESCE(booking_window_start_minute, 0)
--      end_minute   = COALESCE(booking_window_end_minute,   1440)
--    Rows where both were NULL produce NO child rows (= unrestricted, per
--    spec §"Zero ranges for a pair = unrestricted").
INSERT INTO "department_appointment_type_windows"
  ("id", "department_appointment_type_id", "start_minute", "end_minute",
   "created_at", "created_by", "updated_at")
SELECT
  gen_random_uuid(),
  "id",
  COALESCE("booking_window_start_minute", 0),
  COALESCE("booking_window_end_minute", 1440),
  "created_at",
  "created_by",
  now()
FROM "department_appointment_types"
WHERE
  "booking_window_start_minute" IS NOT NULL
  OR "booking_window_end_minute" IS NOT NULL;

-- 3a. Drop the F13 CHECK constraints that reference the old columns.
ALTER TABLE "department_appointment_types"
  DROP CONSTRAINT IF EXISTS "department_appointment_types_window_bounds";

ALTER TABLE "department_appointment_types"
  DROP CONSTRAINT IF EXISTS "department_appointment_types_window_order";

-- 3b. Drop the two old columns.
ALTER TABLE "department_appointment_types"
  DROP COLUMN "booking_window_start_minute",
  DROP COLUMN "booking_window_end_minute";
