import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination';

import {
  APPOINTMENT_GROUP_STATUS,
  APPOINTMENT_GROUP_STATUS_VALUES,
  type AppointmentGroupStatusFilter,
} from '../appointment-groups.const';

/**
 * Query DTO for `GET /appointment-groups`. Composes the shared
 * pagination contract with the per-patient + tri-state status filter.
 *
 * `patientId` is required — every group view is scoped to one patient
 * (the patient-detail timeline). `status` defaults to `'all'` so the
 * caller can list both open + closed threads in one round-trip.
 */
export class ListAppointmentGroupsQueryDto extends PaginationQueryDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef9999' })
  @IsUUID()
  patientId!: string;

  @ApiPropertyOptional({
    enum: APPOINTMENT_GROUP_STATUS_VALUES,
    default: APPOINTMENT_GROUP_STATUS.ALL,
    example: APPOINTMENT_GROUP_STATUS.OPEN,
    description:
      'Tri-state filter: `open` (closedAt IS NULL), `closed` (closedAt IS NOT NULL), `all` (both).',
  })
  @IsOptional()
  @IsIn(APPOINTMENT_GROUP_STATUS_VALUES)
  status?: AppointmentGroupStatusFilter;
}
