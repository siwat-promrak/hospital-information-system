/**
 * FE-side mirror of the canonical permission catalog (see
 * `apps/api/src/auth/permissions.ts` for the source of truth). The FE only
 * needs the codes — descriptions stay on the BE so admin UIs can reuse them.
 *
 * Mirroring here is the current contract (rule 2b in CLAUDE.md): cross-tier
 * permission codes appear in BOTH catalogs so a rename surfaces as a build
 * error on both sides. A future `packages/shared` workspace will dedupe.
 *
 * The catalog encodes **scope** in the code suffix:
 *   - `.own` — limited to the caller's own row (e.g. a doctor's own schedule).
 *   - `.own-department` — limited to rows in the caller's department.
 *   - `.all` — unrestricted across the org.
 *   - no suffix — permission has no scope variants (scope-less catalogs like
 *     `user.*`, `role.*`, `patient.*`, and `doctor.read`).
 *
 * Total: 35 codes split across 7 resources (user / role / appointment /
 * schedule / patient / doctor / medical_records).
 */

export const PERMISSION_CODE = {
  // ── User (4) — scope-less admin actions ──────────────────────────────
  USER_CREATE: "user.create",
  USER_READ: "user.read",
  USER_UPDATE: "user.update",
  USER_DELETE: "user.delete",

  // ── Role (4) — scope-less admin actions ──────────────────────────────
  ROLE_CREATE: "role.create",
  ROLE_READ: "role.read",
  ROLE_UPDATE: "role.update",
  ROLE_DELETE: "role.delete",

  // ── Appointment (9) ──────────────────────────────────────────────────
  APPOINTMENT_CREATE_OWN: "appointment.create.own",
  APPOINTMENT_CREATE_OWN_DEPARTMENT: "appointment.create.own-department",
  APPOINTMENT_READ_OWN: "appointment.read.own",
  APPOINTMENT_READ_OWN_DEPARTMENT: "appointment.read.own-department",
  APPOINTMENT_READ_ALL: "appointment.read.all",
  APPOINTMENT_UPDATE_OWN: "appointment.update.own",
  APPOINTMENT_UPDATE_OWN_DEPARTMENT: "appointment.update.own-department",
  APPOINTMENT_DELETE_OWN: "appointment.delete.own",
  APPOINTMENT_DELETE_OWN_DEPARTMENT: "appointment.delete.own-department",

  // ── Schedule (9) ─────────────────────────────────────────────────────
  SCHEDULE_CREATE_OWN: "schedule.create.own",
  SCHEDULE_CREATE_OWN_DEPARTMENT: "schedule.create.own-department",
  SCHEDULE_READ_OWN: "schedule.read.own",
  SCHEDULE_READ_OWN_DEPARTMENT: "schedule.read.own-department",
  SCHEDULE_READ_ALL: "schedule.read.all",
  SCHEDULE_UPDATE_OWN: "schedule.update.own",
  SCHEDULE_UPDATE_OWN_DEPARTMENT: "schedule.update.own-department",
  SCHEDULE_DELETE_OWN: "schedule.delete.own",
  SCHEDULE_DELETE_OWN_DEPARTMENT: "schedule.delete.own-department",

  // ── Patient (4) — scope-less ─────────────────────────────────────────
  PATIENT_CREATE: "patient.create",
  PATIENT_READ: "patient.read",
  PATIENT_UPDATE: "patient.update",
  PATIENT_DELETE: "patient.delete",

  // ── Doctor (1) — scope-less catalog lookup ───────────────────────────
  DOCTOR_READ: "doctor.read",

  // ── Medical Records (4) — no delete ──────────────────────────────────
  MEDICAL_RECORDS_READ_ALL: "medical_records.read.all",
  MEDICAL_RECORDS_CREATE_OWN: "medical_records.create.own",
  MEDICAL_RECORDS_UPDATE_OWN: "medical_records.update.own",
  MEDICAL_RECORDS_UPDATE_ALL: "medical_records.update.all",
} as const;

export type PermissionCodeValue =
  (typeof PERMISSION_CODE)[keyof typeof PERMISSION_CODE];
