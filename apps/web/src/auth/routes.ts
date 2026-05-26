/**
 * Centralised path catalogs so route strings live in exactly one place:
 *
 *  - `FE_PATH` — FE routes under `/[locale]` (the leading slash is the
 *    path WITHIN the locale segment — combine with `/${locale}` for full
 *    URLs).
 *  - `BE_PATH` — paths on the NestJS API (relative to the `/api/v1`
 *    version prefix in `api-internal.ts`). Mirrors the controller routes
 *    declared in `apps/api/src/auth/auth.controller.ts`.
 *
 * Routes referenced from multiple files (middleware, NextAuth pages
 * config, sign-out button, role dispatcher) MUST come from this catalog
 * — never duplicate the literal at the call site.
 */

export const FE_PATH = {
  HOME: "/",
  SIGNIN: "/signin",
  ADMIN: "/admin",
  NURSE: "/nurse",
  MEDICAL_RECORDS_OFFICER: "/medical-records-officer",
  PHARMACY: "/pharmacy",
  DEPARTMENTS: "/departments",
  DOCTORS: "/doctors",
  SCHEDULES: "/schedules",
  MEDICAL_RECORDS: "/medical-records",
  APPOINTMENTS: "/appointments",
  APPOINTMENTS_NEW: "/appointments/new",
  PATIENTS: "/patients",
  PATIENTS_NEW: "/patients/new",
  // F14 — list of multi-visit cases (open + closed).
  APPOINTMENT_GROUPS: "/appointment-groups",
  // F14 — pickup queue for incoming referrals to the caller's department.
  REFERRALS: "/referrals",
  // F15 — dedicated slot finder screen (multi-doctor open-slot exploration).
  FIND_SLOT: "/find-slot",
  // F17 — doctor workspace queue (upcoming BOOKED appointments for the
  // caller's own doctor row). Gated on `doctor_workspace.read.own`.
  WORKSPACE: "/workspace",
} as const;

export type FePath = (typeof FE_PATH)[keyof typeof FE_PATH];

/**
 * Builder for parameterised FE routes. Keeps the literal segment in one
 * place even when the URL includes a runtime id.
 */
export const FE_PATH_BUILDER = {
  doctorDetail: (id: string) => `${FE_PATH.DOCTORS}/${id}`,
  appointmentDetail: (id: string) => `${FE_PATH.APPOINTMENTS}/${id}`,
  // F14 — single-group case-lineage page.
  appointmentGroupDetail: (id: string) =>
    `${FE_PATH.APPOINTMENT_GROUPS}/${id}`,
} as const;

export const BE_PATH = {
  APPOINTMENT_TYPES: "/appointment-types",
  AUTH_RESOLVE: "/auth/resolve",
  AUTH_SIGN_OUT: "/auth/signout",
  ME: "/me",
  DEPARTMENTS: "/departments",
  DOCTORS: "/doctors",
  SCHEDULES: "/schedules",
  SLOTS: "/slots",
  MEDICAL_RECORDS: "/medical-records",
  APPOINTMENTS: "/appointments",
  PATIENTS: "/patients",
  // F14 — paginated multi-visit cases list + detail under
  // `/appointment-groups/:id`. Lives next to `APPOINTMENTS` because
  // groups ARE chains of appointments; the BE module owns its own
  // controller, so the FE keeps a sibling path entry.
  APPOINTMENT_GROUPS: "/appointment-groups",
} as const;

export type BePath = (typeof BE_PATH)[keyof typeof BE_PATH];

/**
 * Builder for parameterised BE routes consumed via the `/api/be/*` rewrite.
 *
 * `GET /departments/:id/doctors` was retired in favour of
 * `GET /doctors?departmentId=<uuid>` (single paginated doctors endpoint
 * with a filter param), so the previous `departmentDoctors` entry is
 * gone.
 *
 * The slot finder (F07) lives on a flat `GET /slots` (see `BE_PATH.SLOTS`):
 * the doctor identity moved from a path segment to the required `doctorId`
 * query param, so no builder is needed — callers concatenate the query
 * string directly in `slot.api.ts`.
 */
export const BE_PATH_BUILDER = {
  doctorDetail: (doctorId: string) => `${BE_PATH.DOCTORS}/${doctorId}`,
  patientDetail: (id: string) => `${BE_PATH.PATIENTS}/${id}`,
  medicalRecord: (id: string) => `${BE_PATH.MEDICAL_RECORDS}/${id}`,
  appointmentDetail: (id: string) => `${BE_PATH.APPOINTMENTS}/${id}`,
  appointmentCancel: (id: string) =>
    `${BE_PATH.APPOINTMENTS}/${id}/cancel`,
  // F14 — doctor-only "this visit is done" toggle. No body; flips the
  // appointment to `COMPLETED`.
  appointmentComplete: (id: string) =>
    `${BE_PATH.APPOINTMENTS}/${id}/complete`,
  // F14 — doctor-only "send to another department" action. Body
  // `{ toDepartmentId }`; stamps `referredToDepartmentId` + `referredAt`.
  appointmentRefer: (id: string) =>
    `${BE_PATH.APPOINTMENTS}/${id}/refer`,
  /**
   * F13 per-(department, type) booking-rule catalog. Returns the
   * appointment types the department offers along with each pair's
   * `durationMinutes` and optional booking-window minute-of-day bounds.
   * Replaces the duration field on the global `GET /appointment-types`.
   */
  departmentAppointmentTypes: (departmentId: string) =>
    `${BE_PATH.DEPARTMENTS}/${departmentId}/appointment-types`,
  // F14 — single-group detail with chronological `appointments` array.
  appointmentGroupDetail: (id: string) =>
    `${BE_PATH.APPOINTMENT_GROUPS}/${id}`,
  // F14 — doctor-only "close this case" toggle. 403s for callers who
  // aren't the latest visit's doctor. No body.
  appointmentGroupClose: (id: string) =>
    `${BE_PATH.APPOINTMENT_GROUPS}/${id}/close`,
  // F17 — doctor-only "follow up" action. Body `{ startAt, note, drug? }`.
  // Atomically completes the current visit and creates a new FOLLOW_UP
  // appointment in the same group.
  appointmentFollowUp: (id: string) =>
    `${BE_PATH.APPOINTMENTS}/${id}/follow-up`,
} as const;
