import { ApiProperty } from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';

/**
 * One allowed booking-time range within `DepartmentAppointmentTypeResponseDto`
 * (F21). Both bounds are wall-clock minute-of-day in `CLINIC_TIMEZONE`.
 */
export class BookingWindowDto {
  @ApiProperty({
    example: 540,
    description:
      'Inclusive lower bound (wall-clock minute-of-day in `CLINIC_TIMEZONE`). ' +
      'Range: [0, 1439].',
  })
  startMinute!: number;

  @ApiProperty({
    example: 660,
    description:
      'Exclusive upper bound (wall-clock minute-of-day in `CLINIC_TIMEZONE`). ' +
      'Value 1440 means "until local midnight". Range: [1, 1440].',
  })
  endMinute!: number;
}

/**
 * One row of `GET /departments/:id/appointment-types` (F21). Mirrors a
 * `DepartmentAppointmentType` join row to the wire — `code` + `label`
 * (same shape the global `GET /appointment-types` had pre-F13) plus the
 * per-pair fields the booking wizard needs to size and gate its slot grid:
 *
 *  - `durationMinutes` — slot length in minutes. Drives the F07 slot
 *    grid step AND the F09 `Appointment.endAt = startAt + duration` math.
 *  - `bookingWindows` — ordered list of allowed wall-clock ranges in
 *    `CLINIC_TIMEZONE` (F21). Empty = unrestricted (bookable any time the
 *    doctor is working). The booking wizard renders these as descriptive
 *    copy (e.g. "09:00–11:00 or 14:00–16:00").
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

  @ApiProperty({
    type: BookingWindowDto,
    isArray: true,
    description:
      'Ordered list of allowed booking-time ranges (F21). Each range is a ' +
      'wall-clock [startMinute, endMinute) window in `CLINIC_TIMEZONE`. ' +
      'Empty array = unrestricted (bookable any time the doctor is working).',
    example: [
      { startMinute: 540, endMinute: 660 },
      { startMinute: 840, endMinute: 960 },
    ],
  })
  bookingWindows!: BookingWindowDto[];
}
