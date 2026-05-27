import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Request body for `POST /appointments/:id/refer` (F18 update of F14 — US-17.6).
 *
 * F18 extends the F14 shape with required `note` and optional `drug` so the
 * referring doctor's clinical reasoning is captured in the visit record as
 * part of the same atomic action. The service inserts a `MedicalRecord` row
 * before stamping `referredToDepartmentId` and transitioning to COMPLETED.
 *
 * The group stays open — destination NURSE picks up via the pending-referral
 * queue (`GET /appointments?pendingReferralOnly=true`).
 */
export class ReferAppointmentDto {
  @ApiProperty({
    example: 'bb3d2f17-3c0b-4b4f-a3e8-31f2bbb55ccc',
    description:
      'Destination department id. Free choice — any valid `departmentId` ' +
      'is accepted (the patient may have never visited the destination ' +
      'department before). FK existence is validated by the service.',
  })
  @IsUUID()
  toDepartmentId!: string;

  @ApiProperty({
    example: 'Referring patient to Neurology for further evaluation of recurring headaches.',
    description: 'Required clinical note for this visit.',
  })
  @IsString()
  @IsNotEmpty()
  note!: string;

  @ApiPropertyOptional({
    example: 'Ibuprofen 400mg PRN for headache relief',
    description: 'Optional medication note (free text).',
  })
  @IsOptional()
  @IsString()
  drug?: string;
}
