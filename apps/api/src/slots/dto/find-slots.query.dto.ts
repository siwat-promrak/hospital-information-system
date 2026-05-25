import { ApiProperty } from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsUUID, Matches } from 'class-validator';

import { SLOT_ISO_DATE_PATTERN } from '../slots.const';

const APPOINTMENT_TYPE_VALUES = Object.values(AppointmentType);

/**
 * Query DTO for `GET /slots`. All FOUR params are REQUIRED mandatory
 * dimension filters: the slot finder is dimension-locked on
 * `(doctor, department, date, type)` and has no sensible defaults —
 * guessing one would produce silently-wrong slots.
 *
 * Validation order: class-validator catches structural problems first
 * (uuid format, calendar-date shape, enum membership) and surfaces them as
 * `400 VALIDATION_FAILED`. Service-layer domain checks
 * (`DEPARTMENT_TYPE_NOT_ALLOWED`, doctor existence) run AFTER the pipe.
 */
export class FindSlotsQueryDto {
  @ApiProperty({
    example: '4f3e2a10-1234-5678-9abc-deadbeef1234',
    description:
      'Doctor to find slots for. REQUIRED — the slot finder is locked to ' +
      'one doctor per call (use repeated calls for multi-doctor probes).',
  })
  @IsNotEmpty()
  @IsUUID()
  doctorId!: string;

  @ApiProperty({
    example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
    description:
      'Department to find slots for. REQUIRED — the slot finder only ' +
      'considers schedules whose `departmentId` matches.',
  })
  @IsNotEmpty()
  @IsUUID()
  departmentId!: string;

  @ApiProperty({
    example: '2026-06-15',
    description:
      'Calendar date (ISO `YYYY-MM-DD`) to find slots for. Interpreted as ' +
      'a UTC day. A fully-past date is allowed and returns `[]`.',
  })
  @IsNotEmpty()
  @Matches(SLOT_ISO_DATE_PATTERN, {
    message: 'date must be an ISO calendar date (YYYY-MM-DD).',
  })
  date!: string;

  @ApiProperty({
    example: AppointmentType.CONSULTATION,
    enum: APPOINTMENT_TYPE_VALUES,
    description:
      'Appointment type. Drives the slot grid step (per-type duration ' +
      'lives in `APPOINTMENT_TYPE_DURATION_MINUTES`). The `(departmentId, ' +
      'type)` pair must exist in `department_appointment_types`; otherwise ' +
      'the endpoint returns `400 DEPARTMENT_TYPE_NOT_ALLOWED`.',
  })
  @IsNotEmpty()
  @IsEnum(AppointmentType, {
    message: `type must be one of: ${APPOINTMENT_TYPE_VALUES.join(', ')}.`,
  })
  type!: AppointmentType;
}
