/**
 * Department API URL constants — endpoint paths consumed by the
 * `GET /departments` + `GET /departments/:id/appointment-types` typed
 * clients.
 *
 * Lives next to `department.api.ts` so the URL contract has a single
 * home (CLAUDE.md rule 2b — no magic strings). Paths are re-exported
 * from `BE_PATH` / `BE_PATH_BUILDER` so callers reach the department-
 * specific constants from `lib/api/department.const.ts` instead of the
 * cross-tier auth catalog.
 */

import { BE_PATH, BE_PATH_BUILDER } from "@/auth/routes";

export const DEPARTMENT_API_PATH = BE_PATH.DEPARTMENTS;

export const DEPARTMENT_API_PATH_BUILDER = {
  /**
   * F13 per-(department, type) booking-rule catalog. The booking wizard
   * fetches this once a department is picked and uses each row's
   * `durationMinutes` + optional booking-window minute-of-day bounds to
   * surface chip copy + drive the slot-grid step. The global
   * `GET /appointment-types` no longer carries `durationMinutes`.
   */
  appointmentTypes: (departmentId: string) =>
    BE_PATH_BUILDER.departmentAppointmentTypes(departmentId),
} as const;
