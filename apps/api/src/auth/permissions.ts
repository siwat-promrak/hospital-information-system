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
 *
 * ── Scope-aware codes ───────────────────────────────────────────────────
 * Several permission codes encode a scope suffix that the service layer
 * MUST honor when narrowing queries:
 *   - `.own`            — restrict to the caller's own resource
 *                         (e.g. `schedule.update.own` → `doctorId = caller.doctorId`)
 *   - `.own-department` — restrict to the caller's `user.departmentId`
 *   - `.all`            — no narrowing (admin / cross-department reads)
 * Codes without a scope suffix (`patient.read`, `doctor.read`, …) have
 * global semantics and are never narrowed.
 *
 * ── CRUD verbs ──────────────────────────────────────────────────────────
 * The catalog uses fine-grained CRUD verbs (`create` / `read` / `update` /
 * `delete`) per resource — replaces the legacy compound verbs
 * (`manage` / `list` / `cancel`) so each HTTP method gates on a single
 * code. The verb is followed by the scope suffix, e.g.
 * `schedule.read.own-department`, `appointment.delete.own`.
 *
 * `medical_records` deliberately omits a delete permission — records are
 * permanent (no soft-delete column in the schema either). After F17 the
 * family holds exactly one code (`medical_records.read.all`) because
 * creation and mutation have moved inside the appointment-action endpoints.
 *
 * ── Catalog totals (F17) ─────────────────────────────────────────────────
 * 33 permissions (was 35): user 4 + role 4 + appointment 9 + schedule 9 +
 * patient 4 + doctor 1 + doctor_workspace 1 + medical_records 1.
 */

export const PERMISSION = {
  // ── User (4) ─────────────────────────────────────────────────────────
  USER_CREATE: 'user.create',
  USER_READ: 'user.read',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',

  // ── Role (4) ─ role.update covers policy assignment too (no separate `policy.*`).
  ROLE_CREATE: 'role.create',
  ROLE_READ: 'role.read',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',

  // ── Appointment (9) ──────────────────────────────────────────────────
  APPOINTMENT_CREATE_OWN: 'appointment.create.own',
  APPOINTMENT_CREATE_OWN_DEPARTMENT: 'appointment.create.own-department',
  APPOINTMENT_READ_OWN: 'appointment.read.own',
  APPOINTMENT_READ_OWN_DEPARTMENT: 'appointment.read.own-department',
  APPOINTMENT_READ_ALL: 'appointment.read.all',
  APPOINTMENT_UPDATE_OWN: 'appointment.update.own',
  APPOINTMENT_UPDATE_OWN_DEPARTMENT: 'appointment.update.own-department',
  APPOINTMENT_DELETE_OWN: 'appointment.delete.own',
  APPOINTMENT_DELETE_OWN_DEPARTMENT: 'appointment.delete.own-department',

  // ── Schedule (9) ─────────────────────────────────────────────────────
  SCHEDULE_CREATE_OWN: 'schedule.create.own',
  SCHEDULE_CREATE_OWN_DEPARTMENT: 'schedule.create.own-department',
  SCHEDULE_READ_OWN: 'schedule.read.own',
  SCHEDULE_READ_OWN_DEPARTMENT: 'schedule.read.own-department',
  SCHEDULE_READ_ALL: 'schedule.read.all',
  SCHEDULE_UPDATE_OWN: 'schedule.update.own',
  SCHEDULE_UPDATE_OWN_DEPARTMENT: 'schedule.update.own-department',
  SCHEDULE_DELETE_OWN: 'schedule.delete.own',
  SCHEDULE_DELETE_OWN_DEPARTMENT: 'schedule.delete.own-department',

  // ── Patient (4) ─ scope-less; full access for anyone with the perm ──
  PATIENT_CREATE: 'patient.create',
  PATIENT_READ: 'patient.read',
  PATIENT_UPDATE: 'patient.update',
  PATIENT_DELETE: 'patient.delete',

  // ── Doctor (1) ─ catalog lookups are global, read-only ──────────────
  DOCTOR_READ: 'doctor.read',

  // ── Doctor Workspace (1) ─ FE nav/page gate; DOCTOR-only ─────────────
  DOCTOR_WORKSPACE_READ_OWN: 'doctor_workspace.read.own',

  // ── Medical Records (1) ─ NO create/update/delete (records are
  //    write-once via appointment-action endpoints after F17) ────────────
  MEDICAL_RECORDS_READ_ALL: 'medical_records.read.all',
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
  // ── User (4) ─────────────────────────────────────────────────────────
  { code: PERMISSION.USER_CREATE, description: 'Pre-create a User row by email + role' },
  { code: PERMISSION.USER_READ, description: 'View User details (single + list)' },
  { code: PERMISSION.USER_UPDATE, description: 'Edit User profile, role, or department' },
  { code: PERMISSION.USER_DELETE, description: 'Soft-delete a User (block sign-in)' },

  // ── Role (4) ─────────────────────────────────────────────────────────
  { code: PERMISSION.ROLE_CREATE, description: 'Create a new custom Role row' },
  { code: PERMISSION.ROLE_READ, description: 'View Role details + the role↔permission policy map' },
  {
    code: PERMISSION.ROLE_UPDATE,
    description:
      'Edit Role name / description AND assign or revoke permissions to/from the role',
  },
  { code: PERMISSION.ROLE_DELETE, description: 'Delete a Role row (only when no users are assigned)' },

  // ── Appointment (9) ──────────────────────────────────────────────────
  {
    code: PERMISSION.APPOINTMENT_CREATE_OWN,
    description: 'Create new appointments where the caller is the assigned doctor',
  },
  {
    code: PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
    description: 'Create new appointments for patients in the caller’s own department',
  },
  {
    code: PERMISSION.APPOINTMENT_READ_OWN,
    description: 'View appointments where the caller is the assigned doctor',
  },
  {
    code: PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
    description: 'View appointments in the caller’s own department',
  },
  {
    code: PERMISSION.APPOINTMENT_READ_ALL,
    description: 'View any appointment across every department',
  },
  {
    code: PERMISSION.APPOINTMENT_UPDATE_OWN,
    description: 'Update appointments where the caller is the assigned doctor',
  },
  {
    code: PERMISSION.APPOINTMENT_UPDATE_OWN_DEPARTMENT,
    description: 'Update appointments in the caller’s own department',
  },
  {
    code: PERMISSION.APPOINTMENT_DELETE_OWN,
    description: 'Cancel / delete appointments where the caller is the assigned doctor',
  },
  {
    code: PERMISSION.APPOINTMENT_DELETE_OWN_DEPARTMENT,
    description: 'Cancel / delete appointments in the caller’s own department',
  },

  // ── Schedule (9) ─────────────────────────────────────────────────────
  {
    code: PERMISSION.SCHEDULE_CREATE_OWN,
    description: 'Create the caller’s own doctor schedules',
  },
  {
    code: PERMISSION.SCHEDULE_CREATE_OWN_DEPARTMENT,
    description: 'Create doctor schedules within the caller’s own department',
  },
  {
    code: PERMISSION.SCHEDULE_READ_OWN,
    description: 'View the caller’s own doctor schedules',
  },
  {
    code: PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
    description: 'View doctor schedules within the caller’s own department',
  },
  {
    code: PERMISSION.SCHEDULE_READ_ALL,
    description: 'View any doctor schedule across every department',
  },
  {
    code: PERMISSION.SCHEDULE_UPDATE_OWN,
    description: 'Update the caller’s own doctor schedules',
  },
  {
    code: PERMISSION.SCHEDULE_UPDATE_OWN_DEPARTMENT,
    description: 'Update doctor schedules within the caller’s own department',
  },
  {
    code: PERMISSION.SCHEDULE_DELETE_OWN,
    description: 'Delete the caller’s own doctor schedules',
  },
  {
    code: PERMISSION.SCHEDULE_DELETE_OWN_DEPARTMENT,
    description: 'Delete doctor schedules within the caller’s own department',
  },

  // ── Patient (4) ─ scope-less ─────────────────────────────────────────
  { code: PERMISSION.PATIENT_CREATE, description: 'Register new patients (walk-in)' },
  { code: PERMISSION.PATIENT_READ, description: 'View patients (single + list)' },
  { code: PERMISSION.PATIENT_UPDATE, description: 'Edit patient demographics' },
  { code: PERMISSION.PATIENT_DELETE, description: 'Soft-delete a patient row' },

  // ── Doctor (1) ───────────────────────────────────────────────────────
  { code: PERMISSION.DOCTOR_READ, description: 'View doctor details (single + list)' },

  // ── Doctor Workspace (1) ─────────────────────────────────────────────
  {
    code: PERMISSION.DOCTOR_WORKSPACE_READ_OWN,
    description:
      'Access the /workspace page and its nav item. DOCTOR-only. BE does not check ' +
      'this code on data reads — workspace data flows through appointment.read.own ' +
      'and medical_records.read.all.',
  },

  // ── Medical Records (1) — write-once after F17 ───────────────────────
  {
    code: PERMISSION.MEDICAL_RECORDS_READ_ALL,
    description: 'View any medical record across every department',
  },
];
