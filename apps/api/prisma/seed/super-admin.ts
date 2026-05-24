/**
 * Seeds the super-admin User at the nil UUID. Must run first because every
 * other seeded row's `created_by` references this id.
 *
 * Bootstrap (chicken-and-egg) — Option C:
 *   `roles.created_by` -> `users.id` and `users.role_id` -> `roles.id`.
 *   Neither table can be populated first if both FKs are non-null. The
 *   chosen resolution: `users.role_id` is NULLABLE in the schema, so the
 *   super-admin is inserted with `role_id = NULL`. The orchestrator then
 *   creates the RBAC tables (whose `created_by` references the now-existing
 *   super-admin) and calls `assignSuperAdminRole` to back-fill the
 *   super-admin's `role_id` with the ADMIN role id. All subsequent users
 *   ALWAYS receive a non-null `role_id`; DTO validation at the API layer
 *   enforces this for non-bootstrap writes.
 *
 * The super-admin's own `created_by` self-references its own id — Postgres
 * allows the single-row INSERT because the FK check fires at end of
 * statement.
 */
import { PrismaClient, type Role, type User } from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

export const SUPER_ADMIN_ID = '00000000-0000-0000-0000-000000000000';

export async function seedSuperAdmin(prisma: PrismaClient): Promise<User> {
  const email = normalizeEmail('superadmin@gmail.com');

  return prisma.user.upsert({
    where: { id: SUPER_ADMIN_ID },
    update: {
      email,
      firstNameEn: 'Super',
      lastNameEn: 'Admin',
      firstNameTh: null,
      lastNameTh: null,
    },
    create: {
      id: SUPER_ADMIN_ID,
      email,
      firstNameEn: 'Super',
      lastNameEn: 'Admin',
      firstNameTh: null,
      lastNameTh: null,
      createdBy: SUPER_ADMIN_ID,
    },
  });
}

/**
 * Back-fills the super-admin's `role_id` once the ADMIN role exists. Called
 * by the orchestrator immediately after `seedRoles`.
 */
export async function assignSuperAdminRole(
  prisma: PrismaClient,
  adminRole: Role,
): Promise<User> {
  return prisma.user.update({
    where: { id: SUPER_ADMIN_ID },
    data: { roleId: adminRole.id },
  });
}
