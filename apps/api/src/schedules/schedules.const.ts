/**
 * Module-level constants for F06 doctor schedules.
 *
 * Schedules are concrete dated windows — `startAt` / `endAt` are UTC
 * timestamps that fully encode the date + time of the working window.
 * There is no recurring weekday template, so no day-of-week catalog
 * lives here anymore.
 *
 * `SCHEDULE_LIST_QUERY_PARAM` is the FE/BE-mirrored param-name catalog
 * (rule 2b — every wire literal is named). The DTO + controller
 * compose query strings against these names so a rename surfaces here.
 */

/**
 * Stable list-order: chronological start time. Lifted into a constant so
 * the controller (paged list) and any internal callers sort identically.
 */
export const SCHEDULE_DB_ORDER_BY = [{ startAt: 'asc' as const }];

/**
 * Query parameter names exposed by `GET /schedules`. Mirrored on the FE
 * so a rename here surfaces on both sides at compile time (rule 2b).
 */
export const SCHEDULE_LIST_QUERY_PARAM = {
  DOCTOR_ID: 'doctorId',
  DEPARTMENT_ID: 'departmentId',
  FROM: 'from',
  TO: 'to',
} as const;

export type ScheduleListQueryParam =
  (typeof SCHEDULE_LIST_QUERY_PARAM)[keyof typeof SCHEDULE_LIST_QUERY_PARAM];

/**
 * ISO calendar-date wire format (`YYYY-MM-DD`). Used by class-validator
 * `@Matches()` on the `from` / `to` list filters.
 */
export const SCHEDULE_ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
