import "server-only";

import { BE_PATH, BE_PATH_BUILDER } from "@/auth/routes";
import type {
  DoctorDetailRow,
  DoctorListRow,
} from "@/types/doctor.types";
import type { Paginated, PaginationParams } from "@/types/pagination.types";

import { DOCTOR_QUERY_PARAM } from "./doctor.const";
import { buildPaginationQuery } from "./pagination";
import { userFetch } from "./server-fetch";

/**
 * Doctor endpoints (F05). Every call is server-side on behalf of the
 * signed-in caller — the session cookie travels via `userFetch`, and the
 * BE's `JwtGuard` + `PermissionsGuard` decide whether to serve or 403.
 */

interface ListDoctorsParams extends PaginationParams {
  departmentId?: string;
}

export function listDoctors(
  params?: ListDoctorsParams,
): Promise<Paginated<DoctorListRow>> {
  const query = buildPaginationQuery(params, {
    [DOCTOR_QUERY_PARAM.DEPARTMENT_ID]: params?.departmentId,
  });

  return userFetch<Paginated<DoctorListRow>>(`${BE_PATH.DOCTORS}${query}`);
}

export function getDoctor(id: string): Promise<DoctorDetailRow> {
  return userFetch<DoctorDetailRow>(BE_PATH_BUILDER.doctorDetail(id));
}
