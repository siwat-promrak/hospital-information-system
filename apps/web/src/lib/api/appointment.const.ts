/**
 * Appointment-API URL constants (F09) — endpoint path + query-parameter
 * names recognised by `GET /appointments` and any FE surface that builds
 * links to an appointment page.
 *
 * Lives next to `appointment.api.ts` so the URL contract has a single
 * home (CLAUDE.md rule 2b — no magic strings). The path is re-exported
 * from `BE_PATH` / `BE_PATH_BUILDER` so callers reach the appointment-
 * specific constants from `lib/api/appointment.const.ts` instead of the
 * cross-tier auth catalog.
 */

import { BE_PATH, BE_PATH_BUILDER } from "@/auth/routes";

export const APPOINTMENT_API_PATH = BE_PATH.APPOINTMENTS;

export const APPOINTMENT_API_PATH_BUILDER = {
  detail: (id: string) => BE_PATH_BUILDER.appointmentDetail(id),
  cancel: (id: string) => BE_PATH_BUILDER.appointmentCancel(id),
} as const;

export const APPOINTMENT_QUERY_PARAM = {
  /** BE-bound — restrict to one doctor. Auto-narrowed for DOCTOR callers. */
  DOCTOR_ID: "doctorId",
  /** BE-bound — restrict to one patient. */
  PATIENT_ID: "patientId",
  /** BE-bound — restrict to one department. Auto-narrowed for NURSE callers. */
  DEPARTMENT_ID: "departmentId",
  /** BE-bound — inclusive lower bound of the date filter (`YYYY-MM-DD`). */
  FROM: "from",
  /** BE-bound — inclusive upper bound of the date filter (`YYYY-MM-DD`). */
  TO: "to",
  /** BE-bound — `AppointmentStatus` enum value. */
  STATUS: "status",
  /** BE-bound — sort direction for `startAt`. `asc` (default) or `desc`. */
  ORDER: "order",
} as const;

export type AppointmentQueryParam =
  (typeof APPOINTMENT_QUERY_PARAM)[keyof typeof APPOINTMENT_QUERY_PARAM];

/**
 * The two sort directions accepted by `GET /appointments?order=`. Mirrors
 * the BE `APPOINTMENT_LIST_ORDER` catalog.
 */
export const APPOINTMENT_LIST_ORDER = {
  ASC: "asc",
  DESC: "desc",
} as const;

export type AppointmentListOrderValue =
  (typeof APPOINTMENT_LIST_ORDER)[keyof typeof APPOINTMENT_LIST_ORDER];

/**
 * The three statuses an appointment row can carry. Mirrors the Prisma
 * `AppointmentStatus` enum.
 */
export const APPOINTMENT_STATUS = {
  BOOKED: "BOOKED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;

export type AppointmentStatusValue =
  (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];

/**
 * Known error codes the FE narrows with `hasCode(err, code)`. Mirrored
 * from the BE catalog (`apps/api/src/common/errors.ts`) — drift means a
 * 4xx the FE can't recognise.
 *
 * Other codes the appointments endpoint may emit (`VALIDATION_FAILED`,
 * `INSUFFICIENT_PERMISSION`, `INSUFFICIENT_PERMISSION_SCOPE`,
 * `NOT_FOUND`) belong to the shared catalog and surface via the generic
 * `ApiError.code` field; only appointment-specific codes are listed here.
 */
export const APPOINTMENT_ERROR_CODE = {
  SLOT_TAKEN: "SLOT_TAKEN",
  SLOT_OUTSIDE_SCHEDULE: "SLOT_OUTSIDE_SCHEDULE",
  SLOT_OVERLAPS_BREAK: "SLOT_OVERLAPS_BREAK",
  SCHEDULE_NOT_FOUND_FOR_BOOKING: "SCHEDULE_NOT_FOUND_FOR_BOOKING",
  SCHEDULE_NOT_BOOKABLE: "SCHEDULE_NOT_BOOKABLE",
  APPOINTMENT_START_IN_PAST: "APPOINTMENT_START_IN_PAST",
  APPOINTMENT_NOT_FOUND: "APPOINTMENT_NOT_FOUND",
  APPOINTMENT_ALREADY_CANCELLED: "APPOINTMENT_ALREADY_CANCELLED",
  APPOINTMENT_ALREADY_COMPLETED: "APPOINTMENT_ALREADY_COMPLETED",
  DEPARTMENT_TYPE_NOT_ALLOWED: "DEPARTMENT_TYPE_NOT_ALLOWED",
  DOCTOR_DEPARTMENT_MISMATCH: "DOCTOR_DEPARTMENT_MISMATCH",
} as const;

export type AppointmentErrorCode =
  (typeof APPOINTMENT_ERROR_CODE)[keyof typeof APPOINTMENT_ERROR_CODE];
