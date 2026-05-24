/**
 * Seeds the three canonical RBAC roles — ADMIN, STAFF, DOCTOR — keyed by
 * `code`. Returned to the orchestrator so downstream seeders can resolve
 * `role_id` by handle. Re-runnable: upsert by unique `code`.
 *
 * Bootstrap note: the caller MUST ensure the super-admin User row already
 * exists (with `role_id = NULL`) before invoking this function, because
 * `roles.created_by` FKs to `users.id`. After roles exist, the orchestrator
 * back-fills the super-admin's `role_id` with the ADMIN role id.
 */
import { PrismaClient, type Role, type User } from '@prisma/client';

export interface SeededRoles {
  admin: Role;
  staff: Role;
  doctor: Role;
}

interface RoleSpec {
  code: string;
  name: string;
  description: string;
}

const ROLE_SPECS: RoleSpec[] = [
  {
    code: 'ADMIN',
    name: 'Administrator',
    description: 'User, role, and permission management. Clinic-operations permissions can be granted to ADMIN at runtime via permission.assign if needed.',
  },
  {
    code: 'STAFF',
    name: 'Clinic Staff',
    description: 'Front-desk operator: patients, appointments, doctor schedules.',
  },
  {
    code: 'DOCTOR',
    name: 'Doctor',
    description:
      'Data-only role attached to clinicians. Holds no permissions in P0; doctors do not sign in.',
  },
];

export async function seedRoles(
  prisma: PrismaClient,
  superAdmin: User,
): Promise<SeededRoles> {
  const byCode = new Map<string, Role>();

  for (const spec of ROLE_SPECS) {
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

  const admin = byCode.get('ADMIN');
  const staff = byCode.get('STAFF');
  const doctor = byCode.get('DOCTOR');

  if (!admin || !staff || !doctor) {
    throw new Error('seedRoles: failed to load ADMIN/STAFF/DOCTOR after upsert');
  }

  return { admin, staff, doctor };
}
