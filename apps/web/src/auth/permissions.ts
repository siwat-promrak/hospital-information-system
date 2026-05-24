/**
 * FE-side mirror of the canonical permission catalog (see
 * `apps/api/src/auth/permissions.ts` for the source of truth). The FE only
 * needs the codes — descriptions stay on the BE so admin UIs can reuse them.
 *
 * Mirroring here is the current contract (rule 2b in CLAUDE.md): cross-tier
 * permission codes appear in BOTH catalogs so a rename surfaces as a build
 * error on both sides. A future `packages/shared` workspace will dedupe.
 */

export const PERMISSION_CODE = {
  APPOINTMENT_CREATE: "appointment.create",
  APPOINTMENT_CANCEL: "appointment.cancel",
  APPOINTMENT_LIST: "appointment.list",
  APPOINTMENT_READ: "appointment.read",
  SCHEDULE_MANAGE: "schedule.manage",
  PATIENT_CREATE: "patient.create",
  PATIENT_READ: "patient.read",
  PATIENT_UPDATE: "patient.update",
  PATIENT_LIST: "patient.list",
  DOCTOR_READ: "doctor.read",
  DOCTOR_LIST: "doctor.list",
  USER_INVITE: "user.invite",
  USER_DISABLE: "user.disable",
  USER_LIST: "user.list",
  ROLE_MANAGE: "role.manage",
  PERMISSION_ASSIGN: "permission.assign",
} as const;

export type PermissionCodeValue =
  (typeof PERMISSION_CODE)[keyof typeof PERMISSION_CODE];
