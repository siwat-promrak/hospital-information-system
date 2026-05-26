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
