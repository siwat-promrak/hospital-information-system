/**
 * Seeds the three canonical RBAC roles from the catalog declared in
 * `src/auth/roles.ts` — ADMIN, STAFF, DOCTOR. Returned to the orchestrator
 * so downstream seeders can resolve `role_id` by handle. Re-runnable: upsert
 * by unique `code`.
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
  staff: Role;
  doctor: Role;
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
      },
      create: {
        code: spec.code,
        name: spec.name,
        description: spec.description,
        createdBy: superAdmin.id,
      },
    });

    byCode.set(role.code, role);
  }

  const admin = byCode.get(ROLE.ADMIN);
  const staff = byCode.get(ROLE.STAFF);
  const doctor = byCode.get(ROLE.DOCTOR);

  if (!admin || !staff || !doctor) {
    throw new Error('seedRoles: failed to load ADMIN/STAFF/DOCTOR after upsert');
  }

  return { admin, staff, doctor };
}
