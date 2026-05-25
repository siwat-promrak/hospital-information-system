import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Request body for `POST /medical-records`. `doctorId` is intentionally
 * NOT in the DTO — the service sets it from the caller's JWT
 * (`caller.doctor.id`) so a DOCTOR cannot author a record as someone else.
 *
 * `departmentId` is also derived from the doctor row at write time (mirrors
 * the schedule + appointment write paths), so it stays off the wire.
 *
 * `drug` is free-text for P0; future revisions will swap it for a JSONB
 * array of `{ name, dosage, schedule }` entries.
 */
export class CreateMedicalRecordDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  @IsUUID()
  patientId!: string;

  @ApiProperty({ example: '7c8e2a10-1234-5678-9abc-deadbeefcafe' })
  @IsUUID()
  appointmentId!: string;

  @ApiProperty({
    example:
      'Patient presented with mild hypertension. Recommend lifestyle changes ' +
      'and a follow-up in two weeks.',
    description: 'Free-text clinical note (required, max 4000 chars).',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note!: string;

  @ApiPropertyOptional({
    example: 'Amlodipine 5mg once daily for 30 days.',
    description: 'Optional free-text drug / prescription notes (max 2000 chars).',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  drug?: string | null;
}
