import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Request body for `POST /appointments`. The booker wizard fills every
 * uuid from the F07 slot finder; the BE re-validates inside a
 * serializable transaction.
 *
 * `reason` is required iff `appointmentType === PROCEDURE` — the
 * `@ValidateIf` guard skips the string checks for the other types so
 * the wizard does not have to default an empty value for non-procedure
 * bookings.
 */
export class CreateAppointmentDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef9999' })
  @IsUUID()
  patientId!: string;

  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  @IsUUID()
  doctorId!: string;

  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  @IsUUID()
  departmentId!: string;

  @ApiProperty({
    example: 'fa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
    description:
      'Owning schedule id — taken verbatim from the slot the user picked ' +
      '(`SlotResponse.scheduleId`). Populates `Appointment.scheduleId` and ' +
      'gates booking validation against the schedule window + ' +
      '`acceptsBooking` flag.',
  })
  @IsUUID()
  scheduleId!: string;

  @ApiProperty({ enum: AppointmentType, example: AppointmentType.CONSULTATION })
  @IsEnum(AppointmentType)
  appointmentType!: AppointmentType;

  @ApiProperty({
    example: '2026-06-15T09:00:00.000Z',
    description: 'Slot start (ISO 8601 UTC). `endAt` is computed by the BE.',
  })
  @IsISO8601()
  startAt!: string;

  @ApiPropertyOptional({
    example: 'Routine pacemaker check-up',
    description:
      'Free-text reason. REQUIRED when `appointmentType === PROCEDURE`; ' +
      'optional otherwise (when omitted the BE stores `null`).',
    nullable: true,
  })
  // ValidateIf gates the validation chain: when the value is undefined AND
  // the type is NOT PROCEDURE, all subsequent validators are skipped (the
  // field is treated as optional). When the type IS PROCEDURE the chain
  // always runs — `@IsString @MinLength(1)` rejects both `undefined` and
  // empty-string, surfacing as `400 VALIDATION_FAILED`.
  @ValidateIf((o: CreateAppointmentDto) =>
    o.appointmentType === AppointmentType.PROCEDURE || o.reason !== undefined,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  reason?: string | null;
}
