/**
 * Canonical RBAC permission catalog — the single source of truth used by:
 *  - `@RequirePermission(PERMISSION.X)` decorators on controllers
 *  - the Prisma `permissions` seeder (`prisma/seed/permissions.ts`)
 *  - downstream message catalogs (`Permissions.*` namespace in F12)
 *
 * Adding a permission means:
 *  1. add one entry to `PERMISSION` (key) and one to `PERMISSION_CATALOG`
 *     (with description),
 *  2. re-run the seed,
 *  3. grant it to the relevant role(s) via `permission.assign` at runtime.
 *
 * Keys are UPPER_SNAKE_CASE TypeScript handles; values are the wire codes
 * persisted in the `permissions.code` column (DOT.case).
 */

export const PERMISSION = {
  APPOINTMENT_CREATE: 'appointment.create',
  APPOINTMENT_CANCEL: 'appointment.cancel',
  APPOINTMENT_LIST: 'appointment.list',
  APPOINTMENT_READ: 'appointment.read',
  SCHEDULE_MANAGE: 'schedule.manage',
  PATIENT_CREATE: 'patient.create',
  PATIENT_READ: 'patient.read',
  PATIENT_UPDATE: 'patient.update',
  PATIENT_LIST: 'patient.list',
  DOCTOR_READ: 'doctor.read',
  DOCTOR_LIST: 'doctor.list',
  USER_INVITE: 'user.invite',
  USER_DISABLE: 'user.disable',
  USER_LIST: 'user.list',
  ROLE_MANAGE: 'role.manage',
  PERMISSION_ASSIGN: 'permission.assign',
} as const;

export type PermissionCode = (typeof PERMISSION)[keyof typeof PERMISSION];

export interface PermissionCatalogEntry {
  code: PermissionCode;
  description: string;
}

/**
 * Ordered listing (with descriptions) consumed by the Prisma seeder and any
 * future admin UI that wants to render the full catalog. Order is mirrored
 * in `docs/feature-roadmap.md` §2 and `docs/user-stories.md` E1 — keep them
 * in sync when a new permission is added.
 */
export const PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = [
  { code: PERMISSION.APPOINTMENT_CREATE, description: 'Create new appointments for any patient' },
  { code: PERMISSION.APPOINTMENT_CANCEL, description: 'Cancel any appointment' },
  { code: PERMISSION.APPOINTMENT_LIST, description: 'List all appointments with filters' },
  { code: PERMISSION.APPOINTMENT_READ, description: "View an appointment's detail" },
  { code: PERMISSION.SCHEDULE_MANAGE, description: 'Create / update / delete doctor schedules' },
  { code: PERMISSION.PATIENT_CREATE, description: 'Register new patients (walk-in)' },
  { code: PERMISSION.PATIENT_READ, description: 'View patient details' },
  { code: PERMISSION.PATIENT_UPDATE, description: 'Edit patient demographics' },
  { code: PERMISSION.PATIENT_LIST, description: 'List all patients' },
  { code: PERMISSION.DOCTOR_READ, description: 'View doctor details' },
  { code: PERMISSION.DOCTOR_LIST, description: 'List doctors and departments' },
  { code: PERMISSION.USER_INVITE, description: 'Pre-create a User row by email + role' },
  { code: PERMISSION.USER_DISABLE, description: 'Soft-delete a User (block sign-in)' },
  { code: PERMISSION.USER_LIST, description: 'List all Users' },
  { code: PERMISSION.ROLE_MANAGE, description: 'Create / update / delete / list roles' },
  {
    code: PERMISSION.PERMISSION_ASSIGN,
    description: 'Create / delete policies (assign permissions to roles)',
  },
];
