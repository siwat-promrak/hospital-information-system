import "server-only";

import type {
  CreateScheduleBody,
  ScheduleResponse,
  UpdateScheduleBody,
} from "@/types/schedule.types";
import type { Paginated, PaginationParams } from "@/types/pagination.types";

import { buildPaginationQuery } from "./pagination";
import {
  SCHEDULE_API_PATH,
  SCHEDULE_API_PATH_BUILDER,
  SCHEDULE_QUERY_PARAM,
} from "./schedule.const";
import { userFetch } from "./server-fetch";

/**
 * Schedule endpoints (F06). Every call is server-side on behalf of the
 * signed-in caller — the session cookie travels via `userFetch`, and the
 * BE's `JwtGuard` + `PermissionsGuard` + service-layer own-doctor scope
 * decide whether to serve or 403.
 *
 * BE wire contract v2: list endpoints accept `?doctorId=&departmentId=`
 * filters plus a `?from=YYYY-MM-DD&to=YYYY-MM-DD` date range and the
 * shared `?page=&pageSize=` envelope. `pageSize` accepts the
 * `PAGE_SIZE_ALL` sentinel ("all") so a date-bounded calendar window
 * never truncates the tail of a busy month/week. When a DOCTOR caller
 * lists without a `doctorId`, the BE auto-scopes to their own record.
 */

interface ListSchedulesParams extends PaginationParams {
  doctorId?: string;
  departmentId?: string;
  /** Inclusive lower bound for `startAt` (ISO date, `YYYY-MM-DD`). */
  from?: string;
  /** Inclusive upper bound for `startAt` (ISO date, `YYYY-MM-DD`). */
  to?: string;
}

export function listSchedules(
  params?: ListSchedulesParams,
): Promise<Paginated<ScheduleResponse>> {
  const query = buildPaginationQuery(params, {
    [SCHEDULE_QUERY_PARAM.DOCTOR_ID]: params?.doctorId,
    [SCHEDULE_QUERY_PARAM.DEPARTMENT_ID]: params?.departmentId,
    [SCHEDULE_QUERY_PARAM.FROM]: params?.from,
    [SCHEDULE_QUERY_PARAM.TO]: params?.to,
  });

  return userFetch<Paginated<ScheduleResponse>>(`${SCHEDULE_API_PATH}${query}`);
}

export function getSchedule(id: string): Promise<ScheduleResponse> {
  return userFetch<ScheduleResponse>(SCHEDULE_API_PATH_BUILDER.detail(id));
}

export function createSchedule(
  body: CreateScheduleBody,
): Promise<ScheduleResponse> {
  return userFetch<ScheduleResponse>(SCHEDULE_API_PATH, {
    method: "POST",
    body,
  });
}

export function updateSchedule(
  id: string,
  body: UpdateScheduleBody,
): Promise<ScheduleResponse> {
  return userFetch<ScheduleResponse>(SCHEDULE_API_PATH_BUILDER.detail(id), {
    method: "PATCH",
    body,
  });
}

export function deleteSchedule(id: string): Promise<void> {
  return userFetch<void>(SCHEDULE_API_PATH_BUILDER.detail(id), {
    method: "DELETE",
  });
}
