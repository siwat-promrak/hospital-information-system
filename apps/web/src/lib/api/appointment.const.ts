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
  // F14 — doctor-only "this visit is done" toggle. No body.
  complete: (id: string) => BE_PATH_BUILDER.appointmentComplete(id),
  // F14 — doctor-only "send to another department" action. Body
  // `{ toDepartmentId }`.
  refer: (id: string) => BE_PATH_BUILDER.appointmentRefer(id),
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
  /**
   * F14 — request the pending-referral pickup queue. When `true`, narrows
   * to `status=COMPLETED` + `referredToDepartmentId IS NOT NULL` +
   * `referralFulfilledByAppointmentId IS NULL`. The destination-dept
   * narrowing comes from the caller's permission scope: `.own-department`
   * sees referrals to their own dept; `.all` (MRO) sees referrals to every
   * dept. No client-supplied department arg — the previous
   * `pendingReferralToDepartmentId` filter was unsafe for `.all` callers
   * (an undefined value collapsed the entire filter and leaked unreferred
   * rows into the queue).
   */
  PENDING_REFERRAL_ONLY: "pendingReferralOnly",
  /**
   * F14 — booking-wizard continuation step pre-fill. Surfaced as a URL
   * param so the referrals queue's "Book follow-up" link can deep-link
   * straight into the wizard with the prior visit pre-supplied.
   */
  PREVIOUS_APPOINTMENT_ID: "previousAppointmentId",
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
  /**
   * F13 — the proposed `startAt` falls outside the
   * `(department, type)` row's `bookingWindowStartMinute` /
   * `bookingWindowEndMinute` bounds. Surfaces when a direct API caller
   * bypasses the wizard's window filter on `GET /slots`; the wizard's
   * slot grid already hides forbidden slots so the user shouldn't hit
   * this through normal flow.
   */
  APPOINTMENT_OUTSIDE_BOOKING_WINDOW: "APPOINTMENT_OUTSIDE_BOOKING_WINDOW",
  /**
   * F14 (corrective tightening) — `POST /appointments` was given a
   * `previousAppointmentId` that points to a row whose status is NOT
   * `COMPLETED` (typically still `BOOKED`, occasionally `CANCELLED`).
   * The booking wizard's continuation picker hides ineligible rows, so a
   * caller hitting this either bypassed the wizard or deep-linked into
   * the wizard with a stale `previousAppointmentId` query param.
   */
  PREVIOUS_APPOINTMENT_NOT_COMPLETED: "PREVIOUS_APPOINTMENT_NOT_COMPLETED",
  /**
   * F14 (corrective tightening) — `POST /appointments` was given a
   * `previousAppointmentId` paired with an `appointmentType` that is
   * NOT in `CONTINUATION_APPOINTMENT_TYPES` (i.e. not `FOLLOW_UP` or
   * `PROCEDURE`). The wizard hides the disallowed type chips, so this
   * surfaces only when a caller bypasses the wizard.
   */
  CONTINUATION_APPOINTMENT_TYPE_INVALID: "CONTINUATION_APPOINTMENT_TYPE_INVALID",
} as const;

export type AppointmentErrorCode =
  (typeof APPOINTMENT_ERROR_CODE)[keyof typeof APPOINTMENT_ERROR_CODE];

/**
 * F14 (corrective tightening) — the appointment types that are valid
 * for a CONTINUATION booking (one that carries a `previousAppointmentId`).
 *
 * The booking wizard's continuation step uses this set to narrow the
 * per-department type catalog when a prior visit is picked; the BE
 * enforces the same set on `POST /appointments` via
 * `CONTINUATION_APPOINTMENT_TYPE_INVALID`. Drift between the FE filter
 * and the BE check would surface as a generic 422 instead of the user
 * being unable to pick a forbidden type — so this catalog lives in one
 * place and the BE mirrors it.
 *
 * Rationale: a `NEW_PATIENT_VISIT` is by definition a first visit
 * (continuations don't apply), and a `CONSULTATION` opens a new case
 * thread rather than continuing one. Only `FOLLOW_UP` (the usual
 * "come back next week") and `PROCEDURE` (the planned next-step
 * intervention against the prior diagnosis) make semantic sense as a
 * continuation of a prior visit.
 */
export const CONTINUATION_APPOINTMENT_TYPES = [
  "FOLLOW_UP",
  "PROCEDURE",
] as const;

export type ContinuationAppointmentType =
  (typeof CONTINUATION_APPOINTMENT_TYPES)[number];

/**
 * Membership test for the continuation-allowed catalog. Lives next to
 * the const so consumers don't have to re-import `Array.includes` typing
 * gymnastics — a single named predicate keeps the call sites flat.
 */
export function isContinuationAppointmentType(
  code: string,
): code is ContinuationAppointmentType {
  return (CONTINUATION_APPOINTMENT_TYPES as readonly string[]).includes(code);
}
