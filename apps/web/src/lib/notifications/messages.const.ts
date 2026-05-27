/**
 * Snackbar message catalogs.
 *
 * Two responsibilities:
 *
 *  - `SNACKBAR_SUCCESS_KEY` — semantic names for every success-toast site.
 *    Each value matches an entry under `Snackbar.Success.*` in
 *    `messages/en.json` so the hook can resolve a typed key into a
 *    locale-aware string via the generated `K` catalog.
 *
 *  - `ERROR_CODE_TO_KEY` — maps an `ApiError.code` (BE wire code, e.g.
 *    `SCHEDULE_OVERLAP`) to the matching `Snackbar.Errors.*` key.
 *    Unmapped codes fall back to `Snackbar.Errors.generic` so the user
 *    always sees *something* — silent failures are worse than a generic
 *    message.
 *
 * Both maps live here (and NOT inline in the consuming hook) per
 * CLAUDE.md rule 2a / 2b — every domain-carrying string literal goes
 * through a named constant.
 */

import { K } from "@/i18n/keys.generated";
import { APPOINTMENT_GROUP_ERROR_CODE } from "@/lib/api/appointment-group.const";
import { APPOINTMENT_ERROR_CODE } from "@/lib/api/appointment.const";
import { PATIENT_ERROR_CODE } from "@/lib/api/patient.const";
import { SCHEDULE_ERROR_CODE } from "@/lib/api/schedule.const";

// F18 error code that needs a localized toast. The code is BE-defined but
// not repeated in `APPOINTMENT_ERROR_CODE` because it bridges the
// `medical_records` and `appointments` domains — keeping it here avoids
// polluting the appointment-specific catalog with a record-domain code.
const MEDICAL_RECORD_ALREADY_EXISTS_CODE =
  APPOINTMENT_ERROR_CODE.MEDICAL_RECORD_ALREADY_EXISTS;

/**
 * Canonical names for every success-toast site. Each value must exist
 * under `Snackbar.Success.*` in the i18n catalog.
 */
export const SNACKBAR_SUCCESS_KEY = {
  SCHEDULE_CREATED: "scheduleCreated",
  SCHEDULE_UPDATED: "scheduleUpdated",
  SCHEDULE_DELETED: "scheduleDeleted",
  SIGNED_OUT: "signedOut",
  PATIENT_CREATED: "patientCreated",
  APPOINTMENT_CREATED: "appointmentCreated",
  APPOINTMENT_CANCELLED: "appointmentCancelled",
  // F14 success toasts
  APPOINTMENT_COMPLETED: "appointmentCompleted",
  APPOINTMENT_REFERRED: "appointmentReferred",
  APPOINTMENT_GROUP_CLOSED: "appointmentGroupClosed",
  // F18 success toasts
  APPOINTMENT_FOLLOWED_UP: "appointmentFollowedUp",
} as const;

export type SnackbarSuccessKey =
  (typeof SNACKBAR_SUCCESS_KEY)[keyof typeof SNACKBAR_SUCCESS_KEY];

type SnackbarErrorMessageKey = keyof typeof K.Snackbar.Errors;

/**
 * Wire-code → message-key map. Unmapped codes fall through to the generic
 * fallback so the user always sees *something* — silent failures are
 * worse than a generic message. The hook handles the fallback so adding a
 * new mapping is a single entry here.
 *
 * Values are typed against the generated `K.Snackbar.Errors` catalog so a
 * typo here surfaces as a TS error instead of a runtime missing-key warning.
 */
export const ERROR_CODE_TO_KEY: Readonly<
  Record<string, SnackbarErrorMessageKey>
> = {
  // Schedules (F06)
  [SCHEDULE_ERROR_CODE.OVERLAP]: K.Snackbar.Errors.overlap,
  [SCHEDULE_ERROR_CODE.DOCTOR_NOT_IN_DEPARTMENT]:
    K.Snackbar.Errors.doctorNotInDepartment,
  [SCHEDULE_ERROR_CODE.INSUFFICIENT_PERMISSION_SCOPE]:
    K.Snackbar.Errors.scopeViolation,
  [SCHEDULE_ERROR_CODE.INSUFFICIENT_PERMISSION]: K.Snackbar.Errors.forbidden,
  [SCHEDULE_ERROR_CODE.START_IN_PAST]: K.Snackbar.Errors.startInPast,

  // Patients (F09)
  [PATIENT_ERROR_CODE.PATIENT_EMAIL_EXISTS]:
    K.Snackbar.Errors.patientEmailExists,

  // Appointments / booking (F09)
  [APPOINTMENT_ERROR_CODE.SLOT_TAKEN]: K.Snackbar.Errors.slotTaken,
  [APPOINTMENT_ERROR_CODE.SLOT_OUTSIDE_SCHEDULE]:
    K.Snackbar.Errors.slotOutsideSchedule,
  [APPOINTMENT_ERROR_CODE.SLOT_OVERLAPS_BREAK]:
    K.Snackbar.Errors.slotOverlapsBreak,
  [APPOINTMENT_ERROR_CODE.SCHEDULE_NOT_FOUND_FOR_BOOKING]:
    K.Snackbar.Errors.scheduleNotFoundForBooking,
  [APPOINTMENT_ERROR_CODE.SCHEDULE_NOT_BOOKABLE]:
    K.Snackbar.Errors.scheduleNotBookable,
  [APPOINTMENT_ERROR_CODE.APPOINTMENT_START_IN_PAST]:
    K.Snackbar.Errors.appointmentStartInPast,
  [APPOINTMENT_ERROR_CODE.APPOINTMENT_NOT_FOUND]:
    K.Snackbar.Errors.appointmentNotFound,
  [APPOINTMENT_ERROR_CODE.APPOINTMENT_ALREADY_CANCELLED]:
    K.Snackbar.Errors.appointmentAlreadyCancelled,
  [APPOINTMENT_ERROR_CODE.APPOINTMENT_ALREADY_COMPLETED]:
    K.Snackbar.Errors.appointmentAlreadyCompleted,
  [APPOINTMENT_ERROR_CODE.DEPARTMENT_TYPE_NOT_ALLOWED]:
    K.Snackbar.Errors.departmentTypeNotAllowed,
  [APPOINTMENT_ERROR_CODE.DOCTOR_DEPARTMENT_MISMATCH]:
    K.Snackbar.Errors.doctorDepartmentMismatch,
  [APPOINTMENT_ERROR_CODE.APPOINTMENT_OUTSIDE_BOOKING_WINDOW]:
    K.Snackbar.Errors.outsideBookingWindow,
  // F14 — booking-wizard continuation tightening. The BE rejects
  // continuations whose prior visit isn't COMPLETED, and continuations
  // whose appointment type is not in `CONTINUATION_APPOINTMENT_TYPES`.
  // The wizard hides ineligible rows / types, so these toasts only fire
  // when a caller (CLI / Postman / a stale referrals deep-link) reaches
  // `POST /appointments` directly.
  [APPOINTMENT_ERROR_CODE.PREVIOUS_APPOINTMENT_NOT_COMPLETED]:
    K.Snackbar.Errors.previousAppointmentNotCompleted,
  [APPOINTMENT_ERROR_CODE.CONTINUATION_APPOINTMENT_TYPE_INVALID]:
    K.Snackbar.Errors.continuationAppointmentTypeInvalid,

  // Appointment groups + referrals (F14)
  [APPOINTMENT_GROUP_ERROR_CODE.PREVIOUS_APPOINTMENT_CANCELLED]:
    K.Snackbar.Errors.previousAppointmentCancelled,
  [APPOINTMENT_GROUP_ERROR_CODE.APPOINTMENT_GROUP_CLOSED]:
    K.Snackbar.Errors.appointmentGroupClosed,
  [APPOINTMENT_GROUP_ERROR_CODE.APPOINTMENT_GROUP_PATIENT_MISMATCH]:
    K.Snackbar.Errors.appointmentGroupPatientMismatch,
  [APPOINTMENT_GROUP_ERROR_CODE.REFERRAL_DEPARTMENT_MISMATCH]:
    K.Snackbar.Errors.referralDepartmentMismatch,
  [APPOINTMENT_GROUP_ERROR_CODE.REFERRAL_ALREADY_FULFILLED]:
    K.Snackbar.Errors.referralAlreadyFulfilled,
  [APPOINTMENT_GROUP_ERROR_CODE.APPOINTMENT_ALREADY_REFERRED]:
    K.Snackbar.Errors.appointmentAlreadyReferred,
  [APPOINTMENT_GROUP_ERROR_CODE.APPOINTMENT_GROUP_CLOSE_FORBIDDEN]:
    K.Snackbar.Errors.appointmentGroupCloseForbidden,
  [APPOINTMENT_GROUP_ERROR_CODE.APPOINTMENT_NOT_BOOKED]:
    K.Snackbar.Errors.appointmentNotBooked,

  // F18 — duplicate workspace action on the same appointment. The panel
  // hides once status !== BOOKED so this is a race guard.
  [MEDICAL_RECORD_ALREADY_EXISTS_CODE]:
    K.Snackbar.Errors.medicalRecordAlreadyExists,
};

/** Single key for the generic-error path — defined once so the hook + tests share it. */
export const SNACKBAR_GENERIC_ERROR_KEY: SnackbarErrorMessageKey =
  K.Snackbar.Errors.generic;
