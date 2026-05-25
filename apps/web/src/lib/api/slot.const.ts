/**
 * Slot-API URL constants (F07) — endpoint path, query-parameter names, and
 * known error codes consumed by `GET /slots`.
 *
 * Lives next to `slot.api.ts` so the URL contract has a single home
 * (CLAUDE.md rule 2b — no magic strings).
 */

import { BE_PATH } from "@/auth/routes";

/**
 * Static path for the slot-finder URL. The BE mounts the controller at
 * `@Controller('slots')` so the path no longer nests under the doctor id —
 * `doctorId` rides along as a required query param (see
 * `SLOT_QUERY_PARAM.DOCTOR_ID`).
 */
export const SLOT_API_PATH = BE_PATH.SLOTS;

export const SLOT_QUERY_PARAM = {
  /** BE-bound — selects the doctor whose slot grid to compute. REQUIRED. */
  DOCTOR_ID: "doctorId",
  /** BE-bound — restrict to one department. REQUIRED. */
  DEPARTMENT_ID: "departmentId",
  /** BE-bound — UTC calendar day (`YYYY-MM-DD`). REQUIRED. */
  DATE: "date",
  /** BE-bound — `AppointmentType` enum, drives the slot-grid step. REQUIRED. */
  TYPE: "type",
} as const;

export type SlotQueryParam =
  (typeof SLOT_QUERY_PARAM)[keyof typeof SLOT_QUERY_PARAM];

/**
 * Known error codes the FE narrows with `hasCode(err, code)`. Mirrored from
 * the BE catalog (`apps/api/src/slots/slots.const.ts` +
 * `apps/api/src/common/errors.ts`) — drift means a 400 the FE can't
 * recognise.
 *
 * Other codes the endpoint may emit (`VALIDATION_FAILED`,
 * `INSUFFICIENT_PERMISSION`, `NOT_FOUND`) belong to the shared catalog and
 * surface via the generic `ApiError.code` field; only slot-specific codes
 * are listed here.
 */
export const SLOT_ERROR_CODE = {
  DEPARTMENT_TYPE_NOT_ALLOWED: "DEPARTMENT_TYPE_NOT_ALLOWED",
} as const;

export type SlotErrorCode =
  (typeof SLOT_ERROR_CODE)[keyof typeof SLOT_ERROR_CODE];
