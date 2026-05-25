/**
 * Schedule-API URL constants (F06) — endpoint path + query-parameter names
 * recognised by `GET /schedules` and any FE surface that builds links to
 * the schedule pages.
 *
 * Lives next to `schedule.api.ts` so the URL contract has a single home
 * (CLAUDE.md rule 2b — no magic strings).
 *
 * `SCHEDULE_VIEW` is FE-only state — the BE doesn't care whether the page
 * renders a month grid or a week grid; it only sees the `from` / `to`
 * date range the page computed from the chosen view.
 *
 * Known error codes the FE narrows with `hasCode(err, code)`. Mirrored from
 * the BE catalog — drift means a 409 the FE can't recognise.
 */

import { BE_PATH } from "@/auth/routes";

/**
 * Re-exported from `BE_PATH` so callers import the schedule-specific
 * constant from `lib/api/schedule.const.ts` instead of reaching into the
 * cross-tier auth catalog.
 */
export const SCHEDULE_API_PATH = BE_PATH.SCHEDULES;

export const SCHEDULE_API_PATH_BUILDER = {
  detail: (id: string) => `${BE_PATH.SCHEDULES}/${id}`,
} as const;

export const SCHEDULE_QUERY_PARAM = {
  /** BE-bound — restrict to one doctor. */
  DOCTOR_ID: "doctorId",
  /** BE-bound — restrict to one department. */
  DEPARTMENT_ID: "departmentId",
  /** BE-bound — inclusive lower bound of the date filter (`YYYY-MM-DD`). */
  FROM: "from",
  /** BE-bound — inclusive upper bound of the date filter (`YYYY-MM-DD`). */
  TO: "to",
  /** BE-bound — page number for the shared pagination envelope. */
  PAGE: "page",
  /** BE-bound — page size for the shared pagination envelope. */
  PAGE_SIZE: "pageSize",
  /**
   * FE-only URL state — the active view (`month` or `week`). Consumed by
   * the page server-component to decide which sub-view to render and how
   * to compute the `from` / `to` range.
   */
  VIEW: "view",
  /**
   * FE-only URL state — the month being shown (`YYYY-MM`). Only used when
   * `view === "month"`.
   */
  MONTH: "month",
  /**
   * FE-only URL state — the ISO Monday that anchors the week view
   * (`YYYY-MM-DD`). Only used when `view === "week"`.
   */
  WEEK_START: "weekStart",
  /**
   * FE-only URL state — DOCTOR-only scope toggle on the unified
   * `/schedules` page. Values: `"mine"` (filter to caller's own doctor row)
   * or `"dept"` (show every schedule in caller's department). Other view
   * modes ignore this param. Defaults to `"mine"` on first visit.
   */
  SCOPE: "scope",
} as const;

export type ScheduleQueryParam =
  (typeof SCHEDULE_QUERY_PARAM)[keyof typeof SCHEDULE_QUERY_PARAM];

/**
 * The two calendar layouts. Stored in the URL as `?view=…` so a deep link
 * to a specific view + date survives a page reload.
 */
export const SCHEDULE_VIEW = {
  MONTH: "month",
  WEEK: "week",
} as const;

export type ScheduleView = (typeof SCHEDULE_VIEW)[keyof typeof SCHEDULE_VIEW];

/**
 * Values for the DOCTOR-only scope toggle (`?scope=`). Picked verbatim from
 * the URL so the page server-component can dispatch without parsing.
 */
export const SCHEDULE_SCOPE = {
  MINE: "mine",
  DEPT: "dept",
} as const;

export type ScheduleScope =
  (typeof SCHEDULE_SCOPE)[keyof typeof SCHEDULE_SCOPE];

export const SCHEDULE_ERROR_CODE = {
  OVERLAP: "SCHEDULE_OVERLAP",
  DOCTOR_NOT_IN_DEPARTMENT: "DOCTOR_NOT_IN_DEPARTMENT",
  INSUFFICIENT_PERMISSION_SCOPE: "INSUFFICIENT_PERMISSION_SCOPE",
  INSUFFICIENT_PERMISSION: "INSUFFICIENT_PERMISSION",
  /**
   * Returned by `POST /schedules` AND `PATCH /schedules/:id` when the
   * resulting `startAt` is in the past. The BE re-checks on the merged
   * row, so a PATCH that combines existing + partial fields can also
   * surface this.
   */
  START_IN_PAST: "SCHEDULE_START_IN_PAST",
} as const;

export type ScheduleErrorCode =
  (typeof SCHEDULE_ERROR_CODE)[keyof typeof SCHEDULE_ERROR_CODE];
