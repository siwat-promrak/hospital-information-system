/**
 * Seeds the default role→permission grants:
 *
 *   - ADMIN : all 15 permissions.
 *   - STAFF : 11 permissions — everything EXCEPT `user.invite`,
 *             `user.disable`, `user.list`, `permission.assign`.
 *   - DOCTOR: none (data-only role; doctors do not sign in in P0).
 *
 * Total: 15 + 11 + 0 = 26 policy rows. Idempotent: upsert keyed by the
 * `(roleId, permissionId)` unique pair.
 */
import { PrismaClient, type User } from '@prisma/client';

import type { PermissionMap } from './permissions';
import type { SeededRoles } from './roles';

const ADMIN_GRANTS: string[] = [
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
  'user.invite',
  'user.disable',
  'user.list',
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
