import "server-only";

import type {
  AppointmentGroupDetailRow,
  AppointmentGroupRow,
  AppointmentGroupStatus,
} from "@/types/appointment-group.types";
import type { Paginated, PaginationParams } from "@/types/pagination.types";

import {
  APPOINTMENT_GROUP_API_PATH,
  APPOINTMENT_GROUP_API_PATH_BUILDER,
  APPOINTMENT_GROUP_QUERY_PARAM,
} from "./appointment-group.const";
import { buildPaginationQuery } from "./pagination";
import { userFetch } from "./server-fetch";

/**
 * F14 appointment-group endpoints. Every call is server-side on behalf
 * of the signed-in caller — the session cookie travels via `userFetch`,
 * and the BE's `JwtGuard` + `PermissionsGuard` + service-layer scope
 * filters decide whether to serve or 403.
 *
 * The list endpoint shares the appointment-READ permission family
 * (`appointment.read.{own, own-department, all}`); narrowing by patient
 * is opt-in (front-desk pulls the patient's case list). The close
 * action enforces "must be the latest visit's doctor" — `403`s any other
 * caller with `APPOINTMENT_GROUP_CLOSE_FORBIDDEN`.
 */

interface ListAppointmentGroupsParams extends PaginationParams {
  patientId?: string;
  status?: AppointmentGroupStatus;
}

export function listAppointmentGroups(
  params?: ListAppointmentGroupsParams,
): Promise<Paginated<AppointmentGroupRow>> {
  const query = buildPaginationQuery(params, {
    [APPOINTMENT_GROUP_QUERY_PARAM.PATIENT_ID]: params?.patientId,
    [APPOINTMENT_GROUP_QUERY_PARAM.STATUS]: params?.status,
  });

  return userFetch<Paginated<AppointmentGroupRow>>(
    `${APPOINTMENT_GROUP_API_PATH}${query}`,
  );
}

export function getAppointmentGroup(
  id: string,
): Promise<AppointmentGroupDetailRow> {
  return userFetch<AppointmentGroupDetailRow>(
    APPOINTMENT_GROUP_API_PATH_BUILDER.detail(id),
  );
}

export function closeAppointmentGroup(
  id: string,
): Promise<AppointmentGroupDetailRow> {
  return userFetch<AppointmentGroupDetailRow>(
    APPOINTMENT_GROUP_API_PATH_BUILDER.close(id),
    { method: "POST" },
  );
}
