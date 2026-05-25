/**
 * Seeds the default role→permission grants from the catalog declared in
 * `src/auth/roles.ts` (`DEFAULT_ROLE_PERMISSIONS`):
 *
 *   - ADMIN                   : 9  permissions — user / role management +
 *                                doctor.read.
 *   - DOCTOR                  : 14 permissions — own-doctor schedules +
 *                                appointments + medical records, plus
 *                                patient.read + medical_records.read.all.
 *   - NURSE                   : 14 permissions — own-department schedules +
 *                                appointments + patients (full CRUD) +
 *                                doctor.read + medical_records.read.all.
 *   - MEDICAL_RECORDS_OFFICER : 9  permissions — cross-department patients
 *                                + appointment / schedule reads + doctor.read
 *                                + medical_records read/update.all.
 *   - PHARMACY                : 3  permissions — patient.read + doctor.read
 *                                + medical_records.read.all.
 *
 * Total: 9 + 14 + 14 + 9 + 3 = 49 policy rows. Every seeded row is pinned
 * to `isDeletable = false` so a future F11 admin UI cannot remove the
 * baseline grants (the invariant lives in F11's service layer; this seeder
 * just persists the column). Idempotent: upsert keyed by `(roleId,
 * permissionId)`.
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
    { roleId: roles.doctor.id, codes: DEFAULT_ROLE_PERMISSIONS[ROLE.DOCTOR] },
    { roleId: roles.nurse.id, codes: DEFAULT_ROLE_PERMISSIONS[ROLE.NURSE] },
    {
      roleId: roles.medicalRecordsOfficer.id,
      codes: DEFAULT_ROLE_PERMISSIONS[ROLE.MEDICAL_RECORDS_OFFICER],
    },
    { roleId: roles.pharmacy.id, codes: DEFAULT_ROLE_PERMISSIONS[ROLE.PHARMACY] },
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
        update: { isDeletable: false },
        create: {
          roleId: grant.roleId,
          permissionId: permission.id,
          isDeletable: false,
          createdBy: superAdmin.id,
        },
      });

      count += 1;
    }
  }

  return count;
}
