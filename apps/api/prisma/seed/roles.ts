/**
 * Seeds the five canonical RBAC roles from the catalog declared in
 * `src/auth/roles.ts` — ADMIN, DOCTOR, NURSE, MEDICAL_RECORDS_OFFICER,
 * PHARMACY. Returned to the orchestrator so downstream seeders can resolve
 * `role_id` by handle. Re-runnable: upsert by unique `code`.
 *
 * Every seeded row is pinned to `isDeletable = false` so the future F11
 * admin UI cannot delete the baseline; rename / description edits remain
 * allowed. The invariant lives in F11's service layer — this seeder just
 * persists the column.
 *
 * Bootstrap note: the caller MUST ensure the super-admin User row already
 * exists (with `role_id = NULL`) before invoking this function, because
 * `roles.created_by` FKs to `users.id`. After roles exist, the orchestrator
 * back-fills the super-admin's `role_id` with the ADMIN role id.
 */
import { PrismaClient, type Role, type User } from '@prisma/client';

import { ROLE, ROLE_CATALOG } from '../../src/auth/roles';

export interface SeededRoles {
  admin: Role;
  doctor: Role;
  nurse: Role;
  medicalRecordsOfficer: Role;
  pharmacy: Role;
}

export async function seedRoles(
  prisma: PrismaClient,
  superAdmin: User,
): Promise<SeededRoles> {
  const byCode = new Map<string, Role>();

  for (const spec of ROLE_CATALOG) {
    const role = await prisma.role.upsert({
      where: { code: spec.code },
      update: {
        name: spec.name,
        description: spec.description,
        isDeletable: false,
      },
      create: {
        code: spec.code,
        name: spec.name,
        description: spec.description,
        isDeletable: false,
        createdBy: superAdmin.id,
      },
    });

    byCode.set(role.code, role);
  }

  const admin = byCode.get(ROLE.ADMIN);
  const doctor = byCode.get(ROLE.DOCTOR);
  const nurse = byCode.get(ROLE.NURSE);
  const medicalRecordsOfficer = byCode.get(ROLE.MEDICAL_RECORDS_OFFICER);
  const pharmacy = byCode.get(ROLE.PHARMACY);

  if (!admin || !doctor || !nurse || !medicalRecordsOfficer || !pharmacy) {
    throw new Error(
      'seedRoles: failed to load ADMIN / DOCTOR / NURSE / MEDICAL_RECORDS_OFFICER / PHARMACY after upsert',
    );
  }

  return { admin, doctor, nurse, medicalRecordsOfficer, pharmacy };
}
