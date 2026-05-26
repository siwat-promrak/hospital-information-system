/**
 * Patient-API URL constants (F09) — endpoint path + query-parameter names
 * recognised by `GET /patients` and any FE surface that builds links to a
 * patient endpoint.
 *
 * Lives next to `patient.api.ts` so the URL contract has a single home
 * (CLAUDE.md rule 2b — no magic strings).
 */

import { BE_PATH } from "@/auth/routes";

/**
 * Re-exported from `BE_PATH` so callers import the patient-specific
 * constant from `lib/api/patient.const.ts` instead of reaching into the
 * cross-tier auth catalog.
 */
export const PATIENT_API_PATH = BE_PATH.PATIENTS;

export const PATIENT_QUERY_PARAM = {
  /**
   * BE-bound — free-text `contains` over name (en/th), phone,
   * identification number, and HN. Drives the booking wizard's patient
   * picker.
   */
  Q: "q",
} as const;

export type PatientQueryParam =
  (typeof PATIENT_QUERY_PARAM)[keyof typeof PATIENT_QUERY_PARAM];

/**
 * Known error codes the FE narrows with `hasCode(err, code)`. Mirrored from
 * the BE catalog (`apps/api/src/common/errors.ts`) — drift means a 409 the
 * FE can't recognise.
 *
 * Other codes the patients endpoint may emit (`VALIDATION_FAILED`,
 * `INSUFFICIENT_PERMISSION`, `NOT_FOUND`) belong to the shared catalog and
 * surface via the generic `ApiError.code` field; only patient-specific
 * codes are listed here.
 */
export const PATIENT_ERROR_CODE = {
  PATIENT_EMAIL_EXISTS: "PATIENT_EMAIL_EXISTS",
} as const;

export type PatientErrorCode =
  (typeof PATIENT_ERROR_CODE)[keyof typeof PATIENT_ERROR_CODE];

/**
 * Page size used by surfaces that page through patients as the user types
 * in the booking wizard's search box. Kept here so the SSR initial fetch +
 * subsequent typeahead calls stay in lock-step.
 */
export const PATIENT_PICKER_PAGE_SIZE = 20;
