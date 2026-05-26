import { ApiProperty } from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';

/**
 * Wire DTO for one row of `GET /appointment-types`. The endpoint returns
 * an array of these — the per-`AppointmentType` LABEL catalog.
 *
 * Post-F13 this catalog no longer carries `durationMinutes`. The booking
 * wizard reads per-pair duration + booking window from
 * `GET /departments/:id/appointment-types`
 * (`DepartmentAppointmentTypeResponseDto`).
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
}
