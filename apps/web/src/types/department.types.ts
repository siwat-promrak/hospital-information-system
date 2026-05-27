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
 * F13 + F21 — one row of the per-department appointment-type catalog
 * returned by `GET /departments/:id/appointment-types`. Replaces the
 * global `AppointmentTypeResponse.durationMinutes` (the global catalog
 * no longer carries duration) and ships an ordered list of allowed
 * booking-time ranges.
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
   * Ordered list of allowed booking-time ranges (F21). Each range is a
   * half-open `[startMinute, endMinute)` window of wall-clock
   * minute-of-day in the clinic's local timezone. `endMinute = 1440`
   * encodes "until local midnight". Empty array = unrestricted
   * (bookable any time the doctor is working). A slot is bookable when
   * it fits inside ANY one range.
   */
  bookingWindows: { startMinute: number; endMinute: number }[];
}
