import type { AppointmentType } from '@prisma/client';

/**
 * Internal shape backing each `/appointment-types` catalog row. Mirrors
 * `AppointmentTypeResponseDto` (`./dto/appointment-type.response.dto.ts`)
 * which is the wire-facing class. Kept here so `appointment-types.const.ts`
 * (which has no opinion about OpenAPI) can type its export without
 * pulling the DTO into the runtime path.
 *
 * Post-F13 this is a pure label catalog — per-pair `durationMinutes` /
 * `bookingWindow*` live on `DepartmentAppointmentTypeResponseDto`
 * returned by `GET /departments/:id/appointment-types`.
 */
export interface AppointmentTypeEntry {
  code: AppointmentType;
  label: string;
}
