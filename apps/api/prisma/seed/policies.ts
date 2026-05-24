/**
 * Seeds the default role→permission grants:
 *
 *   - ADMIN : 5 permissions — user/role/policy management only
 *             (`user.invite`, `user.disable`, `user.list`, `role.manage`,
 *             `permission.assign`). Clinic-operations permissions are
 *             reserved for STAFF; ADMIN can grant them at runtime via
 *             `permission.assign` if needed.
 *   - STAFF : 11 permissions — appointment.* (4), schedule.manage (1),
 *             patient.create/read/update/list (4), doctor.read,
 *             doctor.list (2).
 *   - DOCTOR: none (data-only role; doctors do not sign in in P0).
 *
 * Total: 5 + 11 + 0 = 16 policy rows. Idempotent: upsert keyed by the
 * `(roleId, permissionId)` unique pair.
 */
import { PrismaClient, type User } from '@prisma/client';

import type { PermissionMap } from './permissions';
import type { SeededRoles } from './roles';

const ADMIN_GRANTS: string[] = [
  'user.invite',
  'user.disable',
  'user.list',
  'role.manage',
  'permission.assign',
];

const STAFF_GRANTS: string[] = [
  'appointment.create',
  'appointment.cancel',
  'appointment.list',
  'appointment.read',
  'schedule.manage',
  'patient.create',
  'patient.read',
  'patient.update',
  'patient.list',
  'doctor.read',
  'doctor.list',
];

const DOCTOR_GRANTS: string[] = [];

export async function seedPolicies(
  prisma: PrismaClient,
  roles: SeededRoles,
  permissions: PermissionMap,
  superAdmin: User,
): Promise<number> {
  const grants: Array<{ roleId: string; codes: string[] }> = [
    { roleId: roles.admin.id, codes: ADMIN_GRANTS },
    { roleId: roles.staff.id, codes: STAFF_GRANTS },
    { roleId: roles.doctor.id, codes: DOCTOR_GRANTS },
  ];

  let count = 0;

  for (const grant of grants) {
    for (const code of grant.codes) {
      const permission = permissions[code];

      if (!permission) {
        throw new Error(`seedPolicies: unknown permission code: ${code}`);
      }

      await prisma.policy.upsert({
        where: {
          roleId_permissionId: {
            roleId: grant.roleId,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: grant.roleId,
          permissionId: permission.id,
          createdBy: superAdmin.id,
        },
      });

      count += 1;
    }
  }

  return count;
}
