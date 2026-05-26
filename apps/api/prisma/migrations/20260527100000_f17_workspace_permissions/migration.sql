-- F17 — Doctor workspace + RBAC collapse of medical-records mutations.
--
-- RBAC catalog delta (35 → 33 permissions, 50 → 48 policies):
--   ADD  `doctor_workspace.read.own`    (DOCTOR-only FE nav gate)
--   DEL  `medical_records.create.own`   (standalone POST /medical-records removed)
--   DEL  `medical_records.update.own`   (PATCH /medical-records/:id removed; records become write-once)
--   DEL  `medical_records.update.all`   (MRO loses mutation; records are now read-only for everyone)
--
-- The `policies.permission_id` FK is `ON DELETE NO ACTION`, so dependent
-- policy rows MUST be deleted before the permission rows. The DELETEs
-- below remove, in order:
--   1. DOCTOR's `medical_records.create.own` + `medical_records.update.own`
--      policies and MRO's `medical_records.update.all` policy.
--   2. The three retired permission rows themselves.
--
-- This migration is idempotent: all INSERTs use `ON CONFLICT DO NOTHING`
-- and all DELETEs are safe to run multiple times.

-- 1. Insert the new permission.
INSERT INTO "permissions" ("id", "code", "description")
SELECT
  gen_random_uuid(),
  'doctor_workspace.read.own',
  'Access the /workspace page and nav item. DOCTOR-only FE gate; BE does not check this on data reads.'
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'doctor_workspace.read.own'
);

-- 2. Insert the new DOCTOR policy: DOCTOR → doctor_workspace.read.own.
--    created_by / updated_at reference the seeded super-admin (nil UUID)
--    and the current timestamp respectively.
INSERT INTO "policies" ("id", "role_id", "permission_id", "is_deletable", "created_by", "updated_at")
SELECT
  gen_random_uuid(),
  r.id,
  p.id,
  false,
  '00000000-0000-0000-0000-000000000000'::uuid,
  NOW()
FROM "roles" r
JOIN "permissions" p ON p.code = 'doctor_workspace.read.own'
WHERE r.code = 'DOCTOR'
  AND NOT EXISTS (
    SELECT 1
    FROM "policies" pol
    WHERE pol.role_id = r.id AND pol.permission_id = p.id
  );

-- 3. Delete the three retired permissions.
--    The FK from policies.permission_id is ON DELETE NO ACTION so we must
--    delete the dependent policy rows first before dropping the permissions.
DELETE FROM "policies"
WHERE "permission_id" IN (
  SELECT "id" FROM "permissions"
  WHERE "code" IN (
    'medical_records.create.own',
    'medical_records.update.own',
    'medical_records.update.all'
  )
);

DELETE FROM "permissions"
WHERE "code" IN (
  'medical_records.create.own',
  'medical_records.update.own',
  'medical_records.update.all'
);
