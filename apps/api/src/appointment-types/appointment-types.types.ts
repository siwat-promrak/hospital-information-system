import type { AppointmentType } from '@prisma/client';

/**
 * Internal shape backing each `/appointment-types` catalog row. Mirrors
 * `AppointmentTypeResponseDto` (`./dto/appointment-type.response.dto.ts`)
 * which is the wire-facing class. Kept here so `appointment-types.const.ts`
 * (which has no opinion about OpenAPI) can type its export without
 * pulling the DTO into the runtime path.
 */
export interface AppointmentTypeEntry {
  code: AppointmentType;
  label: string;
  durationMinutes: number;
}
