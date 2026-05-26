import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Request body for `POST /appointments/:id/complete` (F17 — US-17.4).
 *
 * The note + drug fields submit along with the end-of-visit action so a
 * DOCTOR cannot complete a visit without leaving a clinical record.
 * The service inserts the `MedicalRecord` row inside the same Serializable
 * transaction as the appointment status transition.
 */
export class CompleteAppointmentDto {
  @ApiProperty({
    example: 'Patient responded well to treatment. Advised to rest for 3 days.',
    description:
      'Required clinical note for this visit. Must be non-empty — the BE ' +
      'returns 400 VALIDATION_FAILED when blank.',
  })
  @IsString()
  @IsNotEmpty()
  note!: string;

  @ApiPropertyOptional({
    example: 'Paracetamol 500mg × 3/day for 3 days',
    description: 'Optional medication note (free text).',
  })
  @IsOptional()
  @IsString()
  drug?: string;
}
