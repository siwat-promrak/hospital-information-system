import "server-only";

import type {
  AppointmentListOrder,
  AppointmentResponse,
  AppointmentStatus,
  CancelAppointmentBody,
  CreateAppointmentBody,
} from "@/types/appointment.types";
import type { Paginated, PaginationParams } from "@/types/pagination.types";

import {
  APPOINTMENT_API_PATH,
  APPOINTMENT_API_PATH_BUILDER,
  APPOINTMENT_QUERY_PARAM,
} from "./appointment.const";
import { buildPaginationQuery } from "./pagination";
import { userFetch } from "./server-fetch";

/**
 * Appointment endpoints (F09). Every call is server-side on behalf of the
 * signed-in caller — the session cookie travels via `userFetch`, and the
 * BE's `JwtGuard` + `PermissionsGuard` + service-layer scope filters
 * decide whether to serve or 403.
 *
 * The BE picks the WIDEST scope the caller holds, so the page MUST be
 * explicit about `doctorId` / `departmentId` when it wants narrowing
 * tighter than that. A DOCTOR with both `.own` and `.own-department`
 * (cross-coverage visibility) defaults to the wider `.own-department`
 * unless the page pins `?doctorId=<caller>` itself.
 */

interface ListAppointmentsParams extends PaginationParams {
  doctorId?: string;
  patientId?: string;
  departmentId?: string;
  /** Inclusive lower bound for `startAt` (ISO date, `YYYY-MM-DD`). */
  from?: string;
  /** Inclusive upper bound for `startAt` (ISO date, `YYYY-MM-DD`). */
  to?: string;
  status?: AppointmentStatus;
  order?: AppointmentListOrder;
}

export function listAppointments(
  params?: ListAppointmentsParams,
): Promise<Paginated<AppointmentResponse>> {
  const query = buildPaginationQuery(params, {
    [APPOINTMENT_QUERY_PARAM.DOCTOR_ID]: params?.doctorId,
    [APPOINTMENT_QUERY_PARAM.PATIENT_ID]: params?.patientId,
    [APPOINTMENT_QUERY_PARAM.DEPARTMENT_ID]: params?.departmentId,
    [APPOINTMENT_QUERY_PARAM.FROM]: params?.from,
    [APPOINTMENT_QUERY_PARAM.TO]: params?.to,
    [APPOINTMENT_QUERY_PARAM.STATUS]: params?.status,
    [APPOINTMENT_QUERY_PARAM.ORDER]: params?.order,
  });

  return userFetch<Paginated<AppointmentResponse>>(
    `${APPOINTMENT_API_PATH}${query}`,
  );
}

export function getAppointment(id: string): Promise<AppointmentResponse> {
  return userFetch<AppointmentResponse>(
    APPOINTMENT_API_PATH_BUILDER.detail(id),
  );
}

export function createAppointment(
  body: CreateAppointmentBody,
): Promise<AppointmentResponse> {
  return userFetch<AppointmentResponse>(APPOINTMENT_API_PATH, {
    method: "POST",
    body,
  });
}

export function cancelAppointment(
  id: string,
  body: CancelAppointmentBody,
): Promise<AppointmentResponse> {
  return userFetch<AppointmentResponse>(
    APPOINTMENT_API_PATH_BUILDER.cancel(id),
    {
      method: "POST",
      body,
    },
  );
}
