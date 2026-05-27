import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Request body for `POST /appointments/:id/cancel`. The cancellation
 * reason is required — every cancellation must carry a free-text reason
 * for the audit trail. Whitespace-only input is normalised to the empty
 * string by the `@Transform` below and then fails `@IsNotEmpty()`.
 */
export class CancelAppointmentDto {
  @ApiProperty({
    example: 'Patient no-show',
    description: 'Required free-text reason. Stored on the row for the audit trail.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  cancellationReason!: string;
}
