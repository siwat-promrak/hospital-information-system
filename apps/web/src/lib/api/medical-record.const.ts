/**
 * Medical-record API URL constants (F08+) — endpoint path + query-parameter
 * names recognised by `GET /medical-records` and any FE surface that builds
 * links to a medical-record page.
 *
 * Lives next to `medical-record.api.ts` so the URL contract has a single
 * home (CLAUDE.md rule 2b — no magic strings). The path is re-exported
 * from `BE_PATH` / `BE_PATH_BUILDER` so callers reach the medical-record
 * specific constants from `lib/api/medical-record.const.ts` instead of
 * the cross-tier auth catalog.
 */

import { BE_PATH, BE_PATH_BUILDER } from "@/auth/routes";

export const MEDICAL_RECORD_API_PATH = BE_PATH.MEDICAL_RECORDS;

export const MEDICAL_RECORD_API_PATH_BUILDER = {
  detail: (id: string) => BE_PATH_BUILDER.medicalRecord(id),
} as const;

/**
 * Query-parameter names recognised by `GET /medical-records`. The list
 * endpoint accepts the shared pagination envelope plus per-entity filters
 * — listed here so future FE surfaces (US-8 record browser, US-9 doctor's
 * own list) build query strings from a single source.
 *
 * Filter names are conjectural until the BE handoff lands — names mirror
 * the camelCase wire convention used by other endpoints (`doctorId`,
 * `patientId`, `appointmentId`, `departmentId`). Reconcile when the BE
 * spec ships.
 */
export const MEDICAL_RECORD_QUERY_PARAM = {
  DOCTOR_ID: "doctorId",
  PATIENT_ID: "patientId",
  APPOINTMENT_ID: "appointmentId",
  DEPARTMENT_ID: "departmentId",
} as const;

export type MedicalRecordQueryParam =
  (typeof MEDICAL_RECORD_QUERY_PARAM)[keyof typeof MEDICAL_RECORD_QUERY_PARAM];
