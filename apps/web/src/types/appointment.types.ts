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
 * Thin user reference for the actor who cancelled the appointment.
 * Populated by the BE alongside the existing scalar `cancelledBy` UUID;
 * `null` for legacy rows from before the FK was tightened. Mirrors
 * `AppointmentCancelledByUserRefDto`.
 */
export interface AppointmentCancelledByUserRef {
  id: string;
  firstNameEn: string;
  lastNameEn: string;
}

/**
 * Returned by `POST /appointments` (201), `GET /appointments/:id` (200),
 * and rows in `GET /appointments` (200, paginated).
 *
 * F14 referral fields (`previousAppointmentId`, `referredToDepartmentId`,
 * `referredAt`, `referralFulfilledByAppointmentId`, `appointmentGroupId`)
 * are nullable: appointments booked without a referral / continuation
 * carry `null` for all of them. The detail page shows the "Close case"
 * button only when `appointmentGroupId` is set AND the appointment is
 * the latest non-cancelled visit in the group.
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
  cancelledByUser: AppointmentCancelledByUserRef | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** F14 — non-null when this row continues a prior visit. */
  previousAppointmentId: string | null;
  /** F14 — non-null when this row is the destination of a referral. */
  referredToDepartmentId: string | null;
  /** F14 — ISO 8601 UTC; non-null iff the appointment has a pending or fulfilled referral. */
  referredAt: string | null;
  /** F14 — set once a downstream visit fulfils the referral. */
  referralFulfilledByAppointmentId: string | null;
  /** F14 — non-null once the appointment is part of a multi-visit group. */
  appointmentGroupId: string | null;
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
  /**
   * F14 — link this booking to a prior visit. The BE infers the group
   * (joins the prior visit's group, or opens a new one when the prior
   * visit is ungrouped) and copies `appointmentGroupId` onto the row.
   * Surfaces in two flows:
   *   1. The booking wizard's "Is this a continuation?" step, when the
   *      front desk picks an existing visit.
   *   2. The referrals queue's "Book follow-up" link, which pre-fills
   *      the picked visit via `?previousAppointmentId=…`.
   */
  previousAppointmentId?: string | null;
}

/**
 * Request body for `POST /appointments/:id/cancel`. The BE requires a
 * non-empty `cancellationReason` (validated server-side with
 * `400 VALIDATION_FAILED` on missing / empty / whitespace-only input);
 * the cancel dialog enforces the same rule by disabling the Confirm
 * button until the user types something.
 */
export interface CancelAppointmentBody {
  cancellationReason: string;
}

/**
 * F18 — shared note + drug fields for the three workspace action endpoints
 * (complete / refer / follow-up). Every workspace action creates a
 * `medical_records` row in the same transaction; `note` is required.
 */
export interface WorkspaceNoteBody {
  note: string;
  drug?: string | null;
}

/**
 * F18 — request body for `POST /appointments/:id/complete`.
 */
export interface CompleteAppointmentBody extends WorkspaceNoteBody {}

/**
 * F18 — request body for `POST /appointments/:id/refer`. Extends the
 * F14 refer body with the mandatory workspace note fields.
 */
export interface ReferAppointmentWithNoteBody extends WorkspaceNoteBody {
  referredToDepartmentId: string;
}

/**
 * F18 — request body for `POST /appointments/:id/follow-up`.
 * `startAt` is the ISO 8601 UTC datetime of the new follow-up slot.
 */
export interface FollowUpAppointmentBody extends WorkspaceNoteBody {
  startAt: string;
}

/**
 * Sort direction for `GET /appointments?order=`. Mirrors the BE
 * `APPOINTMENT_LIST_ORDER` catalog. `asc` is the default (chronological
 * upcoming-first); `desc` reverses for "most recent first" views.
 */
export type AppointmentListOrder = "asc" | "desc";
