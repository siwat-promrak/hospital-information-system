import "server-only";

import type {
  AppointmentListOrder,
  AppointmentResponse,
  AppointmentStatus,
  CancelAppointmentBody,
  CompleteAppointmentBody,
  CreateAppointmentBody,
  FollowUpAppointmentBody,
  ReferAppointmentWithNoteBody,
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
  /**
   * F14 — request the pending-referral pickup queue. When `true`, narrows
   * to `status=COMPLETED` + `referredToDepartmentId IS NOT NULL` +
   * `referralFulfilledByAppointmentId IS NULL`. Destination-dept narrowing
   * is driven by the caller's permission scope (`.own-department` → caller
   * dept; `.all` → every dept).
   */
  pendingReferralOnly?: boolean;
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
    [APPOINTMENT_QUERY_PARAM.PENDING_REFERRAL_ONLY]:
      params?.pendingReferralOnly === true ? "true" : undefined,
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

/**
 * F18 — mark an appointment as `COMPLETED` and create a medical-records
 * row in the same transaction. Doctor-only (the BE checks
 * `appointment.update.own` + caller-is-the-appointment-doctor). Body
 * carries the mandatory `note` + optional `drug` for the visit record.
 *
 * Error codes (non-exhaustive): `APPOINTMENT_NOT_BOOKED` (row not BOOKED),
 * `MEDICAL_RECORD_ALREADY_EXISTS` (409, duplicate action — panel hides
 * when status !== BOOKED so this is a race condition guard).
 */
export function completeAppointment(
  id: string,
  body: CompleteAppointmentBody,
): Promise<AppointmentResponse> {
  return userFetch<AppointmentResponse>(
    APPOINTMENT_API_PATH_BUILDER.complete(id),
    {
      method: "POST",
      body,
    },
  );
}

/**
 * F18 — stamp a referral on an appointment and create a medical-records row
 * in the same transaction. The BE writes `referredToDepartmentId` +
 * `referredAt`, opens (or extends) the appointment-group lineage, and
 * surfaces the row on the destination department's pickup queue.
 *
 * Body now includes `{ referredToDepartmentId, note, drug? }` (extended
 * from the F14 `{ toDepartmentId }` shape — field renamed on the wire).
 * Non-doctor callers get a 403; an already-referred row 409s with
 * `APPOINTMENT_ALREADY_REFERRED`.
 */
export function referAppointment(
  id: string,
  body: ReferAppointmentWithNoteBody,
): Promise<AppointmentResponse> {
  return userFetch<AppointmentResponse>(
    APPOINTMENT_API_PATH_BUILDER.refer(id),
    {
      method: "POST",
      body,
    },
  );
}

/**
 * F18 — atomically complete the current visit and create a new FOLLOW_UP
 * appointment in the same group. Body `{ startAt, note, drug? }`. The BE
 * checks the slot against the doctor's schedule, creates the medical-records
 * row, transitions the current appointment to COMPLETED, and creates the new
 * BOOKED appointment in a single serializable transaction.
 */
export function followUpAppointment(
  id: string,
  body: FollowUpAppointmentBody,
): Promise<AppointmentResponse> {
  return userFetch<AppointmentResponse>(
    APPOINTMENT_API_PATH_BUILDER.followUp(id),
    {
      method: "POST",
      body,
    },
  );
}
