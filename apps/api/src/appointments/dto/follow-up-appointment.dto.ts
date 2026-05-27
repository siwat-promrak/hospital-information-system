import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Request body for `POST /appointments/:id/follow-up` (F18 — US-17.5).
 *
 * Atomic action that completes the current appointment, creates a
 * `MedicalRecord` row for it, and books the next FOLLOW_UP appointment
 * in the same group — all in one Serializable transaction.
 *
 * `startAt` is the UTC datetime of the follow-up slot the doctor picked in
 * the FE dialog (validated against available slots the same way as
 * `POST /appointments`).
 */
export class FollowUpAppointmentDto {
  @ApiProperty({
    example: '2026-06-10T09:00:00.000Z',
    description: 'ISO 8601 UTC datetime for the follow-up slot.',
  })
  @IsISO8601()
  startAt!: string;

  @ApiProperty({
    example: 'Symptoms improving. Follow up in 2 weeks to reassess.',
    description: 'Required clinical note for this visit.',
  })
  @IsString()
  @IsNotEmpty()
  note!: string;

  @ApiPropertyOptional({
    example: 'Amoxicillin 500mg × 3/day for 7 days',
    description: 'Optional medication note (free text).',
  })
  @IsOptional()
  @IsString()
  drug?: string;
}
