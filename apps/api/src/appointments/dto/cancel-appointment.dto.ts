import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request body for `POST /appointments/:id/cancel`. The cancellation
 * reason is optional — many cancellations are no-shows where the front
 * desk has nothing meaningful to type. When omitted the BE stores
 * `null` (cancelled-by + cancelled-at are still recorded for the audit
 * trail).
 */
export class CancelAppointmentDto {
  @ApiPropertyOptional({
    example: 'Patient no-show',
    description: 'Optional free-text reason. Stored on the row for the audit trail.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  cancellationReason?: string | null;
}
