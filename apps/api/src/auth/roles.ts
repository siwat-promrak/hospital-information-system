/**
 * Canonical RBAC role catalog. Mirrors the `roles` table seeded by
 * `prisma/seed/roles.ts`. Custom roles created at runtime (US-11.6) are NOT
 * in this catalog by definition — they live only in the DB.
 *
 * Keys are UPPER_SNAKE_CASE TypeScript handles; values are the `code` column
 * stored on each `Role` row.
 */

import { PERMISSION, type PermissionCode } from './permissions';

export const ROLE = {
  ADMIN: 'ADMIN',
  STAFF: 'STAFF',
  DOCTOR: 'DOCTOR',
} as const;

export type RoleCode = (typeof ROLE)[keyof typeof ROLE];

export interface RoleCatalogEntry {
  code: RoleCode;
  name: string;
  description: string;
}

export const ROLE_CATALOG: readonly RoleCatalogEntry[] = [
  {
    code: ROLE.ADMIN,
    name: 'Administrator',
    description:
      'User, role, and permission management. Clinic-operations permissions can be granted to ADMIN at runtime via permission.assign if needed.',
  },
  {
    code: ROLE.STAFF,
    name: 'Clinic Staff',
    description: 'Front-desk operator: patients, appointments, doctor schedules.',
  },
  {
    code: ROLE.DOCTOR,
    name: 'Doctor',
    description:
      'Clinician with schedule.manage scoped to their own doctor record. Created via admin invite alongside a Doctor row.',
  },
];

/**
 * Roles whose users may complete the `/auth/resolve` flow. Mirrors the
 * union of seeded roles — the resolver re-validates this so a future custom
 * role does NOT accidentally become sign-in-able by default.
 */
export const SIGN_IN_ELIGIBLE_ROLES: readonly RoleCode[] = [
  ROLE.ADMIN,
  ROLE.STAFF,
  ROLE.DOCTOR,
];

/**
 * Seeded policy assignment: which permissions each role starts with.
 * Mirrors the 17-policy baseline (ADMIN→5, STAFF→11, DOCTOR→1) documented in
 * `docs/user-stories.md` E1 / `docs/feature-roadmap.md` §1.3.
 *
 * Lives here (next to the role catalog) so adding a permission to a role
 * baseline is a single-file edit; the Prisma seeder iterates this map.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly PermissionCode[]>> = {
  [ROLE.ADMIN]: [
    PERMISSION.USER_INVITE,
    PERMISSION.USER_DISABLE,
    PERMISSION.USER_LIST,
    PERMISSION.ROLE_MANAGE,
    PERMISSION.PERMISSION_ASSIGN,
  ],
  [ROLE.STAFF]: [
    PERMISSION.APPOINTMENT_CREATE,
    PERMISSION.APPOINTMENT_CANCEL,
    PERMISSION.APPOINTMENT_LIST,
    PERMISSION.APPOINTMENT_READ,
    PERMISSION.SCHEDULE_MANAGE,
    PERMISSION.PATIENT_CREATE,
    PERMISSION.PATIENT_READ,
    PERMISSION.PATIENT_UPDATE,
    PERMISSION.PATIENT_LIST,
    PERMISSION.DOCTOR_READ,
    PERMISSION.DOCTOR_LIST,
  ],
  [ROLE.DOCTOR]: [PERMISSION.SCHEDULE_MANAGE],
};
