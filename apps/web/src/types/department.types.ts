/**
 * Department response shapes. Mirrors the BE types in
 * `apps/api/src/departments/departments.types.ts`. Hand-mirrored — a
 * future `packages/shared` workspace will dedupe.
 */

import type { AppointmentType } from "./appointment-type.types";

/** Returned by `GET /departments`. */
export interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
  /**
   * The `AppointmentType` codes this department offers. Drives the booking
   * wizard's type Select narrowing — only the codes in this set are
   * surfaced once a department is picked. Mirrors the BE's
   * `department_appointment_types` join table per the
   * `DepartmentResponseDto.allowedAppointmentTypes` field.
   */
  allowedAppointmentTypes: readonly AppointmentType[];
}

/**
 * F13 — one row of the per-department appointment-type catalog returned
 * by `GET /departments/:id/appointment-types`. Replaces the global
 * `AppointmentTypeResponse.durationMinutes` (the global catalog no longer
 * carries duration) and adds the optional booking-window bounds.
 *
 * Booking-window minutes are wall-clock minute-of-day in the clinic's
 * local timezone (BE-side `CLINIC_TIMEZONE`, default `Asia/Bangkok`).
 * The BE has already converted UTC instants to local minute-of-day, so
 * the FE just formats `HH:mm` via dayjs without any further timezone
 * arithmetic — see CLAUDE.md §9 / §9a.
 */
export interface DepartmentAppointmentTypeRow {
  code: AppointmentType;
  label: string;
  durationMinutes: number;
  /**
   * Open-ended lower bound. `null` / `undefined` means no morning cutoff
   * (slots earlier than the window start are allowed).
   */
  bookingWindowStartMinute?: number;
  /**
   * Open-ended upper bound. `null` / `undefined` means no afternoon
   * cutoff (slots later than the window end are allowed).
   */
  bookingWindowEndMinute?: number;
}
