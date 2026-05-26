-- F14 — Appointment groups + referrals.
--
-- Adds the new `appointment_groups` table + five additive columns on
-- `appointments` so visits can be linked into clinical threads and
-- referrals between departments tracked on the originating row.
--
-- Pre-F14 rows stay all-NULL on the new columns (`appointment_group_id`,
-- `visit_number`, `referred_to_department_id`, `referred_at`,
-- `referral_fulfilled_by_appointment_id`) — no backfill required.
--
-- Domain invariants live in raw-SQL CHECK constraints (Prisma 5 cannot
-- express CHECK natively):
--   - `appointments_visit_number_consistency` — `appointment_group_id`
--     and `visit_number` are set together (both NULL or both non-NULL
--     with `visit_number >= 1`).
--   - `appointments_referral_pair_consistency` — `referred_to_department_id`
--     and `referred_at` are set together (both NULL or both non-NULL).
--
-- Partial unique index `(appointment_group_id, visit_number)` enforces
-- per-group monotonic visit numbering — pre-F14 rows (NULL group) are
-- excluded so the constraint does not collide on legacy data.

-- 1. New appointment_groups table.
CREATE TABLE "appointment_groups" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "appointment_groups_pkey" PRIMARY KEY ("id")
);

-- 2. Appointment columns — all nullable, additive.
ALTER TABLE "appointments"
    ADD COLUMN "appointment_group_id" UUID,
    ADD COLUMN "visit_number" INTEGER,
    ADD COLUMN "referred_to_department_id" UUID,
    ADD COLUMN "referred_at" TIMESTAMPTZ(3),
    ADD COLUMN "referral_fulfilled_by_appointment_id" UUID;

-- 3. Indexes.
-- Group rollup hot path (appointment-group detail member list).
CREATE INDEX "appointments_appointment_group_id_idx"
    ON "appointments"("appointment_group_id");

-- Pickup queue hot path — partial index keeps it small (only rows that
-- carry a still-unfulfilled referral are stored).
CREATE INDEX "appointments_pending_referral_idx"
    ON "appointments"("referred_to_department_id")
    WHERE "referral_fulfilled_by_appointment_id" IS NULL;

-- Patient → groups list hot path (open vs closed filter).
CREATE INDEX "appointment_groups_patient_id_closed_at_idx"
    ON "appointment_groups"("patient_id", "closed_at");

-- 4. Unique back-link from source-referral to receiver-appointment.
CREATE UNIQUE INDEX "appointments_referral_fulfilled_by_appointment_id_key"
    ON "appointments"("referral_fulfilled_by_appointment_id");

-- 5. Foreign keys.
ALTER TABLE "appointment_groups"
    ADD CONSTRAINT "appointment_groups_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "appointment_groups"
    ADD CONSTRAINT "appointment_groups_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "appointment_groups"
    ADD CONSTRAINT "appointment_groups_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_appointment_group_id_fkey"
    FOREIGN KEY ("appointment_group_id") REFERENCES "appointment_groups"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_referred_to_department_id_fkey"
    FOREIGN KEY ("referred_to_department_id") REFERENCES "departments"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_referral_fulfilled_by_appointment_id_fkey"
    FOREIGN KEY ("referral_fulfilled_by_appointment_id") REFERENCES "appointments"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- 6. Raw-SQL CHECK constraints (Prisma 5 limitation).

-- `appointment_group_id` and `visit_number` are set together (both NULL
-- on standalone rows, both non-NULL on grouped rows). `visit_number` is
-- 1-indexed.
ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_visit_number_consistency"
    CHECK (
        ("appointment_group_id" IS NULL AND "visit_number" IS NULL)
        OR (
            "appointment_group_id" IS NOT NULL
            AND "visit_number" IS NOT NULL
            AND "visit_number" >= 1
        )
    );

-- `referred_to_department_id` and `referred_at` are set together
-- (both NULL on rows that did not refer, both non-NULL after a refer
-- transition).
ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_referral_pair_consistency"
    CHECK (
        ("referred_to_department_id" IS NULL AND "referred_at" IS NULL)
        OR (
            "referred_to_department_id" IS NOT NULL
            AND "referred_at" IS NOT NULL
        )
    );

-- 7. Partial unique on `(group_id, visit_number)` — only grouped rows
-- participate so legacy NULL-group rows do not collide.
CREATE UNIQUE INDEX "appointments_group_visit_number_unique"
    ON "appointments"("appointment_group_id", "visit_number")
    WHERE "appointment_group_id" IS NOT NULL;
