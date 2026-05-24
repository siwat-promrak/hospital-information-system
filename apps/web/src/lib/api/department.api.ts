import "server-only";

import { BE_PATH, BE_PATH_BUILDER } from "@/auth/routes";
import type {
  DepartmentDoctorRow,
  DepartmentRow,
} from "@/types/department.types";

import { userFetch } from "./server-fetch";

/**
 * Department endpoints (F05). Every call is server-side on behalf of
 * the signed-in caller — the session cookie travels via `userFetch`,
 * and the BE's `JwtGuard` + `PermissionsGuard` decide whether to serve
 * or 403.
 */

export function listDepartments(): Promise<DepartmentRow[]> {
  return userFetch<DepartmentRow[]>(BE_PATH.DEPARTMENTS);
}

export function listDepartmentDoctors(
  departmentId: string,
): Promise<DepartmentDoctorRow[]> {
  return userFetch<DepartmentDoctorRow[]>(
    BE_PATH_BUILDER.departmentDoctors(departmentId),
  );
}
