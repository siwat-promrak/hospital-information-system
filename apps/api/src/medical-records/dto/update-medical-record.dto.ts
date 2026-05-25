import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Request body for `PATCH /medical-records/:id`. All fields optional — the
 * service merges over the existing row.
 *
 * `doctorId`, `patientId`, `appointmentId`, and `departmentId` are
 * intentionally excluded — they are pinned at create time and cannot
 * change after the fact (would require a fresh row + audit trail).
 *
 * Passing `drug: null` (literal `null`) on the wire clears the field; an
 * undefined / omitted value leaves the existing value untouched.
 */
export class UpdateMedicalRecordDto {
  @ApiPropertyOptional({
    example: 'Patient improving; continue current regimen.',
    description: 'Updated clinical note (1-4000 chars).',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note?: string;

  @ApiPropertyOptional({
    example: 'Amlodipine 5mg once daily — increase to 10mg if BP > 140/90.',
    description: 'Updated drug notes (max 2000 chars). Pass `null` to clear.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  drug?: string | null;
}
