import { ApiProperty } from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';

/**
 * Wire DTO for one row of `GET /appointment-types`. The endpoint returns
 * an array of these — the per-`AppointmentType` catalog with the matching
 * duration the slot finder + booking flow use to step / size windows.
 *
 * Labels are English-only on the wire; the FE may i18n-overlay them via
 * `Common.AppointmentType.*` in F12.
 */
const APPOINTMENT_TYPE_VALUES = Object.values(AppointmentType);

export class AppointmentTypeResponseDto {
  @ApiProperty({
    enum: APPOINTMENT_TYPE_VALUES,
    example: AppointmentType.CONSULTATION,
    description: 'Prisma `AppointmentType` enum value.',
  })
  code!: AppointmentType;

  @ApiProperty({
    example: 'Consultation',
    description:
      'Human-readable English label. Re-keyed by FE i18n in F12 ' +
      '(`Common.AppointmentType.<code>`).',
  })
  label!: string;

  @ApiProperty({
    example: 20,
    description:
      'Slot duration in minutes. Drives the slot-grid step in F07 and the ' +
      '`endAt = startAt + duration` math in F08.',
  })
  durationMinutes!: number;
}
