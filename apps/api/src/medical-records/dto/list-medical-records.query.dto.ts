import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination';

/**
 * Query DTO for `GET /medical-records`. Composes the shared
 * `PaginationQueryDto` with the filter axes consumed by the
 * patient-detail timeline, doctor's own records list, and the F18
 * visit-thread view (appointmentGroupId).
 *
 * All filters are AND-combined. Missing filters = no constraint.
 */
export class ListMedicalRecordsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '4f3e2a10-1234-5678-9abc-deadbeef1234',
    description: 'Restrict to a single patient.',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
    description: 'Restrict to a single doctor (the authoring doctor).',
  })
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @ApiPropertyOptional({
    example: '7c8e2a10-1234-5678-9abc-deadbeefcafe',
    description: 'Restrict to a single appointment.',
  })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({
    example: 'c1a2b3d4-0001-0002-0003-deadbeef0000',
    description:
      'F18 — Restrict to records whose linked appointment belongs to this appointment group. ' +
      'Used by the visit-thread view to show all prior notes in the same clinical case.',
  })
  @IsOptional()
  @IsUUID()
  appointmentGroupId?: string;
}
