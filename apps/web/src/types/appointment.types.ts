/**
 * Appointment response + request shapes (F09). Mirrors the BE wire DTOs in
 * `apps/api/src/appointments/dto/`. Hand-mirrored — a future
 * `packages/shared` workspace will dedupe.
 *
 * `startAt` / `endAt` / `cancelledAt` / `createdAt` / `updatedAt` are ISO
 * 8601 UTC datetime strings — the FE consumes them via dayjs (CLAUDE.md
 * rule 9) and never instantiates `Date` math by hand.
 *
 * `endAt` is computed by the BE (`startAt +
 * APPOINTMENT_TYPE_DURATION_MINUTES[appointmentType]` ms) — the FE never
 * sends it on the wire.
 *
 * `reason` is REQUIRED iff `appointmentType === PROCEDURE`. For the other
 * three types, omit it or send `null`.
 *
 * `scheduleId` is the F08 provenance FK — every appointment is created
 * against a specific schedule slot; the booker MUST pass back
 * `SlotResponse.scheduleId` from the F07 slot finder.
 */

import type { AppointmentType } from "@/types/appointment-type.types";

/**
 * Mirrors Prisma `AppointmentStatus` enum. `BOOKED` is the create-time
 * default; `CANCELLED` is set by `POST /appointments/:id/cancel`;
 * `COMPLETED` is set elsewhere (out of F09 scope).
 */
export type AppointmentStatus = "BOOKED" | "CANCELLED" | "COMPLETED";

/**
 * Thin patient reference embedded in every `AppointmentResponse`. Mirrors
 * `AppointmentPatientRefDto`.
 */
export interface AppointmentPatientRef {
  id: string;
  hn: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
}

/**
 * Thin doctor reference embedded in every `AppointmentResponse`. Mirrors
 * `AppointmentDoctorRefDto`.
 */
export interface AppointmentDoctorRef {
  id: string;
  doctorCode: string;
  firstNameEn: string;
  lastNameEn: string;
}

/**
 * Thin department reference embedded in every `AppointmentResponse`.
 * Mirrors `AppointmentDepartmentRefDto`.
 */
export interface AppointmentDepartmentRef {
  id: string;
  name: string;
}

/**
 * Returned by `POST /appointments` (201), `GET /appointments/:id` (200),
 * and rows in `GET /appointments` (200, paginated).
 */
export interface AppointmentResponse {
  id: string;
  patientId: string;
  doctorId: string;
  departmentId: string;
  scheduleId: string;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  startAt: string;
  endAt: string;
  reason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  patient: AppointmentPatientRef;
  doctor: AppointmentDoctorRef;
  department: AppointmentDepartmentRef;
}

/**
 * Request body for `POST /appointments`. The booker wizard fills every
 * uuid from the F07 slot finder; the BE re-validates inside a serializable
 * transaction.
 */
export interface CreateAppointmentBody {
  patientId: string;
  doctorId: string;
  departmentId: string;
  scheduleId: string;
  appointmentType: AppointmentType;
  startAt: string;
  reason?: string | null;
}

/**
 * Request body for `POST /appointments/:id/cancel`. The cancellation
 * reason is optional — many cancellations are no-shows where the front
 * desk has nothing meaningful to type.
 */
export interface CancelAppointmentBody {
  cancellationReason?: string | null;
}

/**
 * Sort direction for `GET /appointments?order=`. Mirrors the BE
 * `APPOINTMENT_LIST_ORDER` catalog. `asc` is the default (chronological
 * upcoming-first); `desc` reverses for "most recent first" views.
 */
export type AppointmentListOrder = "asc" | "desc";
