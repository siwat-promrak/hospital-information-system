/**
 * Doctor-API URL constants — query-parameter names recognised by the
 * `GET /doctors` endpoint and any FE surface that builds links to it
 * (the doctors list page, the department filter, department chips).
 *
 * Lives next to `doctor.api.ts` so the URL contract has a single home.
 */

export const DOCTOR_QUERY_PARAM = {
  DEPARTMENT_ID: "departmentId",
} as const;
