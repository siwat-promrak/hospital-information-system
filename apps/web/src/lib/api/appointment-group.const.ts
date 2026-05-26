/**
 * Appointment-group + referral URL constants (F14).
 *
 * Lives next to `appointment-group.api.ts` so the URL contract has a
 * single home (CLAUDE.md rule 2b — no magic strings). Paths are added
 * to `BE_PATH` / `BE_PATH_BUILDER` so the auth catalog stays the single
 * source of truth for backend route literals.
 *
 * Vocabulary: feature is "referrals" (not "transfers" — renamed in
 * commit 2b05fa7). Error codes, query params, and route names all
 * carry the `refer` / `referral` / `referredTo` shape.
 */

import { BE_PATH, BE_PATH_BUILDER } from "@/auth/routes";

export const APPOINTMENT_GROUP_API_PATH = BE_PATH.APPOINTMENT_GROUPS;

export const APPOINTMENT_GROUP_API_PATH_BUILDER = {
  detail: (id: string) => BE_PATH_BUILDER.appointmentGroupDetail(id),
  close: (id: string) => BE_PATH_BUILDER.appointmentGroupClose(id),
} as const;

export const APPOINTMENT_GROUP_QUERY_PARAM = {
  /** BE-bound — restrict to one patient. */
  PATIENT_ID: "patientId",
  /** BE-bound — `open` (default), `closed`, or `all`. */
  STATUS: "status",
} as const;

/**
 * Status filter values for `GET /appointment-groups?status=`. Mirrors
 * the BE catalog — drift means a 400. The list page defaults to `OPEN`
 * because the front desk's hot path is "what cases are still in
 * progress?".
 */
export const APPOINTMENT_GROUP_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
  ALL: "all",
} as const;

export type AppointmentGroupStatusValue =
  (typeof APPOINTMENT_GROUP_STATUS)[keyof typeof APPOINTMENT_GROUP_STATUS];

/**
 * Known F14 error codes the FE narrows with `hasCode(err, code)`. Mirrors
 * the BE catalog under `apps/api/src/common/errors.ts`. Drift means a 4xx
 * the FE can't recognise.
 *
 * The list is shared with `messages.const.ts`'s `ERROR_CODE_TO_KEY` map,
 * so adding a new code here AND a snackbar entry on both sides lights up
 * the localised toast without further wiring.
 */
export const APPOINTMENT_GROUP_ERROR_CODE = {
  PREVIOUS_APPOINTMENT_CANCELLED: "PREVIOUS_APPOINTMENT_CANCELLED",
  APPOINTMENT_GROUP_CLOSED: "APPOINTMENT_GROUP_CLOSED",
  APPOINTMENT_GROUP_PATIENT_MISMATCH: "APPOINTMENT_GROUP_PATIENT_MISMATCH",
  REFERRAL_DEPARTMENT_MISMATCH: "REFERRAL_DEPARTMENT_MISMATCH",
  REFERRAL_ALREADY_FULFILLED: "REFERRAL_ALREADY_FULFILLED",
  APPOINTMENT_ALREADY_REFERRED: "APPOINTMENT_ALREADY_REFERRED",
  APPOINTMENT_GROUP_CLOSE_FORBIDDEN: "APPOINTMENT_GROUP_CLOSE_FORBIDDEN",
  APPOINTMENT_NOT_BOOKED: "APPOINTMENT_NOT_BOOKED",
} as const;

export type AppointmentGroupErrorCode =
  (typeof APPOINTMENT_GROUP_ERROR_CODE)[keyof typeof APPOINTMENT_GROUP_ERROR_CODE];
