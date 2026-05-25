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

/**
 * Page size used by surfaces that page through doctors as the user
 * scrolls (the schedule form's doctor picker — see `ScheduleFormDialog`).
 * Kept here so the SSR initial page + the in-dialog `loadMore` calls
 * stay in lock-step — drift between the two would leak rows or skip rows
 * at the page boundary.
 */
export const DOCTOR_INFINITE_SCROLL_PAGE_SIZE = 20;
