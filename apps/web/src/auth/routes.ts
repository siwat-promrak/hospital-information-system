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
} as const;

export type FePath = (typeof FE_PATH)[keyof typeof FE_PATH];

/**
 * Builder for parameterised FE routes. Keeps the literal segment in one
 * place even when the URL includes a runtime id.
 */
export const FE_PATH_BUILDER = {
  doctorDetail: (id: string) => `${FE_PATH.DOCTORS}/${id}`,
  appointmentDetail: (id: string) => `${FE_PATH.APPOINTMENTS}/${id}`,
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
  medicalRecord: (id: string) => `${BE_PATH.MEDICAL_RECORDS}/${id}`,
  appointmentDetail: (id: string) => `${BE_PATH.APPOINTMENTS}/${id}`,
  appointmentCancel: (id: string) =>
    `${BE_PATH.APPOINTMENTS}/${id}/cancel`,
} as const;
