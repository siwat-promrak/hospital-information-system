import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Request body for `POST /appointments`. The booker wizard fills every
 * uuid from the F07 slot finder; the BE re-validates inside a
 * serializable transaction.
 *
 * `reason` is fully optional for every appointment type. When omitted
 * the BE stores `null`.
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
      'Free-text reason. Fully optional for every appointment type. ' +
      'When omitted the BE stores `null`.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  reason?: string | null;

  @ApiPropertyOptional({
    example: '7c8e2a10-1234-5678-9abc-deadbeefcafe',
    description:
      'Optional id of the previous appointment in the same clinical thread (F14). ' +
      'When set, the booking transaction validates the link, lazily materialises an ' +
      '`AppointmentGroup` if one does not exist, sets `visitNumber` on the new row, ' +
      'and (when the previous row carries a referral matching the new department) ' +
      "back-links the previous row's `referralFulfilledByAppointmentId`.",
  })
  @IsOptional()
  @IsUUID()
  previousAppointmentId?: string;
}
