import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';

/**
 * One row of `GET /departments/:id/appointment-types` (F13). Mirrors a
 * `DepartmentAppointmentType` join row to the wire — `code` + `label`
 * (same shape the global `GET /appointment-types` had pre-F13) plus the
 * three per-pair fields the booking wizard needs to size and gate its
 * slot grid:
 *
 *  - `durationMinutes` — slot length in minutes. Drives the F07 slot
 *    grid step AND the F09 `Appointment.endAt = startAt + duration` math.
 *  - `bookingWindowStartMinute` / `bookingWindowEndMinute` — optional
 *    wall-clock minutes-of-day in `CLINIC_TIMEZONE`. The booking wizard
 *    surfaces them as descriptive copy (e.g. "Before 11:00 only") so the
 *    user understands why later slots may be hidden.
 *
 * Either booking-window bound may be `null` = open-ended on that side;
 * both `null` = the pair is bookable any time the doctor is working.
 */
export class DepartmentAppointmentTypeResponseDto {
  @ApiProperty({
    enum: Object.values(AppointmentType),
    example: AppointmentType.CONSULTATION,
    description: 'Prisma `AppointmentType` enum value.',
  })
  code!: AppointmentType;

  @ApiProperty({
    example: 'Consultation',
    description:
      'Human-readable English label (mirrors `Common.AppointmentType.<code>` ' +
      'on the FE).',
  })
  label!: string;

  @ApiProperty({
    example: 20,
    description:
      'Slot duration in minutes for this (department, type) pair. Drives ' +
      'the booking-wizard grid step and the BE `endAt` math.',
  })
  durationMinutes!: number;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description:
      'Wall-clock minute-of-day (in `CLINIC_TIMEZONE`) marking the inclusive ' +
      'lower bound of when this (department, type) is bookable. `null` = no ' +
      'lower bound.',
  })
  bookingWindowStartMinute!: number | null;

  @ApiPropertyOptional({
    example: 660,
    nullable: true,
    description:
      'Wall-clock minute-of-day (in `CLINIC_TIMEZONE`) marking the exclusive ' +
      'upper bound of when this (department, type) is bookable. `null` = no ' +
      'upper bound. Example `660` = "before 11:00 only".',
  })
  bookingWindowEndMinute!: number | null;
}
