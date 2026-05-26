import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination';
import { SCHEDULE_ISO_DATE_PATTERN } from '../../schedules/schedules.const';

import {
  APPOINTMENT_LIST_ORDER,
  type AppointmentListOrder,
} from '../appointments.const';

/**
 * Query DTO for `GET /appointments`. Composes the shared pagination
 * contract with the filter axes consumed by the booking-board / queue /
 * patient-detail views. All filters AND-combined; missing filters =
 * no constraint.
 *
 * - `from` / `to` are ISO calendar dates; the service expands them to
 *   UTC start/end-of-day bounds and matches `startAt` in range.
 * - `status` is one of `BOOKED | CANCELLED | COMPLETED`.
 * - `order` toggles the chronological sort of `startAt`. Default
 *   ascending.
 */
export class ListAppointmentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @ApiPropertyOptional({ example: '4f3e2a10-1234-5678-9abc-deadbeef9999' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    example: '2026-06-01',
    description: 'Inclusive lower bound (`YYYY-MM-DD`, UTC start-of-day).',
  })
  @IsOptional()
  @Matches(SCHEDULE_ISO_DATE_PATTERN, {
    message: 'from must be an ISO calendar date (YYYY-MM-DD).',
  })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-06-30',
    description: 'Inclusive upper bound (`YYYY-MM-DD`, UTC end-of-day).',
  })
  @IsOptional()
  @Matches(SCHEDULE_ISO_DATE_PATTERN, {
    message: 'to must be an ISO calendar date (YYYY-MM-DD).',
  })
  to?: string;

  @ApiPropertyOptional({ enum: AppointmentStatus, example: AppointmentStatus.BOOKED })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({
    enum: Object.values(APPOINTMENT_LIST_ORDER),
    default: APPOINTMENT_LIST_ORDER.ASC,
    example: APPOINTMENT_LIST_ORDER.ASC,
  })
  @IsOptional()
  @IsIn(Object.values(APPOINTMENT_LIST_ORDER))
  order?: AppointmentListOrder;

  @ApiPropertyOptional({
    example: 'bb3d2f17-3c0b-4b4f-a3e8-31f2bbb55ccc',
    description:
      'F14 pending-referral filter. When set, narrows to rows with ' +
      '`referredToDepartmentId = <param>` AND ' +
      '`referralFulfilledByAppointmentId IS NULL` so the destination ' +
      "department's NURSE sees the still-open pickup queue. Composes " +
      'with the existing `appointment.read.*` scope.',
  })
  @IsOptional()
  @IsUUID()
  pendingReferralToDepartmentId?: string;
}
