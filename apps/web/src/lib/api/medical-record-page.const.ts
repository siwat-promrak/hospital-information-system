/**
 * `/medical-records` browse-page URL constants.
 *
 * Lives next to `medical-record.api.ts` / `medical-record.const.ts` so all
 * URL-shaped contracts for the medical-records feature stay in one place
 * (CLAUDE.md rule 2b — no magic strings).
 *
 * Distinguished from `medical-record.const.ts` because those constants
 * describe the BE wire (the `GET /medical-records?patientId=` query) while
 * these describe the FE page's own URL state (the `?view=` view toggle).
 * Both are surfaced separately so a rename here doesn't accidentally
 * touch the BE-bound names and vice versa.
 */

export const MEDICAL_RECORDS_PAGE_QUERY_PARAM = {
  /**
   * BE-bound — currently selected patient. Drives the BE list fetch; when
   * absent the page renders the empty-state hint and skips the fetch.
   */
  PATIENT_ID: "patientId",
  /**
   * FE-only URL state — which result view the page is rendering. Valid
   * values come from `MEDICAL_RECORDS_VIEW`. Falls back to `LIST` when the
   * URL carries an unrecognised value.
   */
  VIEW: "view",
} as const;

export type MedicalRecordsPageQueryParam =
  (typeof MEDICAL_RECORDS_PAGE_QUERY_PARAM)[keyof typeof MEDICAL_RECORDS_PAGE_QUERY_PARAM];

/**
 * The two result views the page supports. Stored in the URL as `?view=…`
 * so a deep link preserves the user's choice.
 */
export const MEDICAL_RECORDS_VIEW = {
  LIST: "list",
  GRID: "grid",
} as const;

export type MedicalRecordsView =
  (typeof MEDICAL_RECORDS_VIEW)[keyof typeof MEDICAL_RECORDS_VIEW];

/**
 * Narrow an arbitrary string from `?view=` to a known view value or
 * `undefined`. The page applies `LIST` as the default when this returns
 * `undefined`.
 */
export function resolveMedicalRecordsView(
  raw: string | undefined,
): MedicalRecordsView | undefined {
  if (
    raw === MEDICAL_RECORDS_VIEW.LIST ||
    raw === MEDICAL_RECORDS_VIEW.GRID
  ) {
    return raw;
  }

  return undefined;
}
