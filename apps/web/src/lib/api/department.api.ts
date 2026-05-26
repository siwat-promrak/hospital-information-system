import "server-only";

import type {
  DepartmentAppointmentTypeRow,
  DepartmentRow,
} from "@/types/department.types";
import type { Paginated, PaginationParams } from "@/types/pagination.types";

import {
  DEPARTMENT_API_PATH,
  DEPARTMENT_API_PATH_BUILDER,
} from "./department.const";
import { buildPaginationQuery } from "./pagination";
import { userFetch } from "./server-fetch";

/**
 * Department endpoints (F05). Every call is server-side on behalf of
 * the signed-in caller — the session cookie travels via `userFetch`,
 * and the BE's `JwtGuard` + `PermissionsGuard` decide whether to serve
 * or 403.
 *
 * The previous `listDepartmentDoctors` helper has been removed alongside
 * the BE's `GET /departments/:id/doctors` route — callers needing "doctors
 * in this department" should use `listDoctors({ departmentId })` from
 * `doctor.api.ts` instead. Same filter shape, one paginated source of
 * truth.
 */

export function listDepartments(
  params?: PaginationParams,
): Promise<Paginated<DepartmentRow>> {
  return userFetch<Paginated<DepartmentRow>>(
    `${DEPARTMENT_API_PATH}${buildPaginationQuery(params)}`,
  );
}

/**
 * F13 per-(department, type) booking-rule catalog. The booking wizard
 * calls this once a department is picked: each row carries the
 * department-specific `durationMinutes` plus optional wall-clock
 * minute-of-day bounds that gate which slots the BE will let through.
 * Gated on `appointment.read.{own, own-department, all}` (any-of).
 */
export function getDepartmentAppointmentTypes(
  departmentId: string,
): Promise<DepartmentAppointmentTypeRow[]> {
  return userFetch<DepartmentAppointmentTypeRow[]>(
    DEPARTMENT_API_PATH_BUILDER.appointmentTypes(departmentId),
  );
}
