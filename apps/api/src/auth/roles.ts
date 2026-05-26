/**
 * Canonical RBAC role catalog. Mirrors the `roles` table seeded by
 * `prisma/seed/roles.ts`. Custom roles created at runtime (US-11.6) are NOT
 * in this catalog by definition — they live only in the DB.
 *
 * Keys are UPPER_SNAKE_CASE TypeScript handles; values are the `code` column
 * stored on each `Role` row.
 *
 * Seeded baseline rows are marked `is_deletable = false` in the DB
 * (column added to `roles` for this work) so a future F11 admin UI cannot
 * delete the immutable baseline; rename / description edits remain allowed.
 * The invariant lives in the future F11 service layer — this file only
 * documents it.
 */

import { PERMISSION, type PermissionCode } from './permissions';

export const ROLE = {
  ADMIN: 'ADMIN',
  DOCTOR: 'DOCTOR',
  NURSE: 'NURSE',
  MEDICAL_RECORDS_OFFICER: 'MEDICAL_RECORDS_OFFICER',
  PHARMACY: 'PHARMACY',
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
      'User + role management (CRUD on users / roles / policies via role.update). Clinic-operations permissions can be granted to ADMIN at runtime via role.update if needed.',
  },
  {
    code: ROLE.DOCTOR,
    name: 'Doctor',
    description:
      'Clinician with own-doctor scope on schedules + appointments (`*.own`). Sees own-department reads for cross-coverage context. Created via admin invite alongside a Doctor row. Medical-record creation moves inside appointment-action endpoints (F17); records become write-once.',
  },
  {
    code: ROLE.NURSE,
    name: 'Nurse',
    description:
      'Department-scoped clinical front-desk: books / cancels / updates appointments, manages doctor schedules, manages patients (full CRUD), reads medical records — all within the caller’s own department.',
  },
  {
    code: ROLE.MEDICAL_RECORDS_OFFICER,
    name: 'Medical Records Officer',
    description:
      'Cross-department medical records: views all appointments + schedules + medical records, full CRUD on patient demographics. Read-only on medical records after F17 (no mutation permission). No booking, no schedule management.',
  },
  {
    code: ROLE.PHARMACY,
    name: 'Pharmacy',
    description:
      'Cross-department pharmacy: read-only access to patients + doctors + medical records for medication prep. No writes.',
  },
];

/**
 * Roles whose users may complete the `/auth/resolve` flow. Mirrors the
 * union of seeded roles — the resolver re-validates this so a future custom
 * role does NOT accidentally become sign-in-able by default.
 */
export const SIGN_IN_ELIGIBLE_ROLES: readonly RoleCode[] = [
  ROLE.ADMIN,
  ROLE.DOCTOR,
  ROLE.NURSE,
  ROLE.MEDICAL_RECORDS_OFFICER,
  ROLE.PHARMACY,
];

/**
 * Seeded policy assignment: which permissions each role starts with.
 *
 * Totals (48 policies — F17 reduced from 50):
 *   - ADMIN                   : 9   (4 user + 4 role + 1 doctor.read)
 *   - DOCTOR                  : 14  (5 schedule.own + 5 appointment.own + 1
 *                                    patient.read + 1 doctor.read + 1 doctor_workspace.read.own
 *                                    + 1 medical_records.read.all)
 *                                   (was 15: −medical_records.create.own −medical_records.update.own
 *                                    +doctor_workspace.read.own)
 *   - NURSE                   : 14  (4 schedule.own-department + 4 appointment.own-department
 *                                    + 4 patient + 1 doctor.read + 1 medical_records.read.all)
 *   - MEDICAL_RECORDS_OFFICER : 8   (4 patient + 1 appointment.read.all + 1 schedule.read.all
 *                                    + 1 doctor.read + 1 medical_records.read.all)
 *                                   (was 9: −medical_records.update.all)
 *   - PHARMACY                : 3   (patient.read + doctor.read + medical_records.read.all)
 *
 * Lives here (next to the role catalog) so adding a permission to a role
 * baseline is a single-file edit; the Prisma seeder iterates this map.
 * Every seeded policy row is persisted with `is_deletable = false` —
 * a future F11 admin UI must block removal of these baseline grants.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly PermissionCode[]>> = {
  [ROLE.ADMIN]: [
    PERMISSION.USER_CREATE,
    PERMISSION.USER_READ,
    PERMISSION.USER_UPDATE,
    PERMISSION.USER_DELETE,
    PERMISSION.ROLE_CREATE,
    PERMISSION.ROLE_READ,
    PERMISSION.ROLE_UPDATE,
    PERMISSION.ROLE_DELETE,
    PERMISSION.DOCTOR_READ,
  ],
  [ROLE.DOCTOR]: [
    PERMISSION.SCHEDULE_READ_OWN,
    PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
    PERMISSION.SCHEDULE_CREATE_OWN,
    PERMISSION.SCHEDULE_UPDATE_OWN,
    PERMISSION.SCHEDULE_DELETE_OWN,
    PERMISSION.APPOINTMENT_READ_OWN,
    PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_CREATE_OWN,
    PERMISSION.APPOINTMENT_UPDATE_OWN,
    PERMISSION.APPOINTMENT_DELETE_OWN,
    PERMISSION.PATIENT_READ,
    PERMISSION.DOCTOR_READ,
    PERMISSION.DOCTOR_WORKSPACE_READ_OWN,
    PERMISSION.MEDICAL_RECORDS_READ_ALL,
  ],
  [ROLE.NURSE]: [
    PERMISSION.SCHEDULE_CREATE_OWN_DEPARTMENT,
    PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
    PERMISSION.SCHEDULE_UPDATE_OWN_DEPARTMENT,
    PERMISSION.SCHEDULE_DELETE_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_UPDATE_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_DELETE_OWN_DEPARTMENT,
    PERMISSION.PATIENT_CREATE,
    PERMISSION.PATIENT_READ,
    PERMISSION.PATIENT_UPDATE,
    PERMISSION.PATIENT_DELETE,
    PERMISSION.DOCTOR_READ,
    PERMISSION.MEDICAL_RECORDS_READ_ALL,
  ],
  [ROLE.MEDICAL_RECORDS_OFFICER]: [
    PERMISSION.PATIENT_CREATE,
    PERMISSION.PATIENT_READ,
    PERMISSION.PATIENT_UPDATE,
    PERMISSION.PATIENT_DELETE,
    PERMISSION.APPOINTMENT_READ_ALL,
    PERMISSION.SCHEDULE_READ_ALL,
    PERMISSION.DOCTOR_READ,
    PERMISSION.MEDICAL_RECORDS_READ_ALL,
  ],
  [ROLE.PHARMACY]: [
    PERMISSION.PATIENT_READ,
    PERMISSION.DOCTOR_READ,
    PERMISSION.MEDICAL_RECORDS_READ_ALL,
  ],
};
