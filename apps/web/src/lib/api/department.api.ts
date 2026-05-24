import "server-only";

import { BE_PATH, BE_PATH_BUILDER } from "@/auth/routes";
import type {
  DepartmentDoctorRow,
  DepartmentRow,
} from "@/types/department.types";
import type { Paginated, PaginationParams } from "@/types/pagination.types";

import { buildPaginationQuery } from "./pagination";
import { userFetch } from "./server-fetch";

/**
 * Department endpoints (F05). Every call is server-side on behalf of
 * the signed-in caller — the session cookie travels via `userFetch`,
 * and the BE's `JwtGuard` + `PermissionsGuard` decide whether to serve
 * or 403.
 */

export function listDepartments(
  params?: PaginationParams,
): Promise<Paginated<DepartmentRow>> {
  return userFetch<Paginated<DepartmentRow>>(
    `${BE_PATH.DEPARTMENTS}${buildPaginationQuery(params)}`,
  );
}

export function listDepartmentDoctors(
  departmentId: string,
  params?: PaginationParams,
): Promise<Paginated<DepartmentDoctorRow>> {
  return userFetch<Paginated<DepartmentDoctorRow>>(
    `${BE_PATH_BUILDER.departmentDoctors(departmentId)}${buildPaginationQuery(params)}`,
  );
}
