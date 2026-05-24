/**
 * Seeds the default role→permission grants from the catalog declared in
 * `src/auth/roles.ts` (`DEFAULT_ROLE_PERMISSIONS`):
 *
 *   - ADMIN : 5 permissions — user/role/policy management only.
 *             (`user.invite`, `user.disable`, `user.list`, `role.manage`,
 *             `permission.assign`). Clinic-operations (appointment.*,
 *             patient.*, doctor.*, schedule.manage) are NOT granted by
 *             default; ADMIN can grant them at runtime via
 *             `permission.assign` if needed.
 *   - STAFF : 11 permissions — appointment.* (4), schedule.manage (1),
 *             patient.create/read/update/list (4), doctor.read,
 *             doctor.list (2).
 *   - DOCTOR: 1 permission — schedule.manage (so doctors can manage their
 *             OWN schedule once they sign in). NOTE: this is the coarse
 *             permission; the schedule CRUD service MUST enforce
 *             `if user.role === DOCTOR, restrict to schedule.doctorId ===
 *             user.doctor.id` at the app layer. STAFF gets the unrestricted
 *             form of the same permission.
 *
 * Total: 5 + 11 + 1 = 17 policy rows. Idempotent: upsert keyed by the
 * `(roleId, permissionId)` unique pair.
 */
import { PrismaClient, type User } from '@prisma/client';

import { DEFAULT_ROLE_PERMISSIONS, ROLE } from '../../src/auth/roles';

import type { PermissionMap } from './permissions';
import type { SeededRoles } from './roles';

export async function seedPolicies(
  prisma: PrismaClient,
  roles: SeededRoles,
  permissions: PermissionMap,
  superAdmin: User,
): Promise<number> {
  const grants: Array<{ roleId: string; codes: readonly string[] }> = [
    { roleId: roles.admin.id, codes: DEFAULT_ROLE_PERMISSIONS[ROLE.ADMIN] },
    { roleId: roles.staff.id, codes: DEFAULT_ROLE_PERMISSIONS[ROLE.STAFF] },
    { roleId: roles.doctor.id, codes: DEFAULT_ROLE_PERMISSIONS[ROLE.DOCTOR] },
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
