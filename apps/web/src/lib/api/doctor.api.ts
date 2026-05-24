import "server-only";

import { BE_PATH, BE_PATH_BUILDER } from "@/auth/routes";
import type {
  DoctorDetailRow,
  DoctorListRow,
} from "@/types/doctor.types";

import { userFetch } from "./server-fetch";

/**
 * Doctor endpoints (F05). Every call is server-side on behalf of the
 * signed-in caller — the session cookie travels via `userFetch`, and the
 * BE's `JwtGuard` + `PermissionsGuard` decide whether to serve or 403.
 */

export function listDoctors(filter?: {
  departmentId?: string;
}): Promise<DoctorListRow[]> {
  const search = filter?.departmentId
    ? `?departmentId=${encodeURIComponent(filter.departmentId)}`
    : "";

  return userFetch<DoctorListRow[]>(`${BE_PATH.DOCTORS}${search}`);
}

export function getDoctor(id: string): Promise<DoctorDetailRow> {
  return userFetch<DoctorDetailRow>(BE_PATH_BUILDER.doctorDetail(id));
}
