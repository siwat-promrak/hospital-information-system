import "server-only";

import { BE_PATH } from "@/auth/routes";
import type { DepartmentRow } from "@/types/department.types";
import type { Paginated, PaginationParams } from "@/types/pagination.types";

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
    `${BE_PATH.DEPARTMENTS}${buildPaginationQuery(params)}`,
  );
}
