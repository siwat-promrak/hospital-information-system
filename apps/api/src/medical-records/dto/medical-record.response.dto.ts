import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Wire DTOs for the F11-prep `/medical-records` response envelope. These
 * classes ARE the response shape — both the controller return type and
 * the service return type reference `MedicalRecordResponseDto` directly so
 * OpenAPI and runtime stay in lock-step without a parallel TS interface
 * (Item 6 / Pattern A). Field-level `@ApiProperty` decorators drive the
 * OpenAPI schema.
 */

export class MedicalRecordDoctorRefDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  id!: string;

  @ApiProperty({ example: 'MD-0001' })
  doctorCode!: string;

  @ApiProperty({ example: 'Anan' })
  firstNameEn!: string;

  @ApiProperty({ example: 'Charoen' })
  lastNameEn!: string;
}

export class MedicalRecordPatientRefDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef9999' })
  id!: string;

  @ApiProperty({ example: '260000001' })
  hn!: string;

  @ApiProperty({ example: 'Praewa' })
  firstNameEn!: string;

  @ApiProperty({ example: 'Boonmee' })
  lastNameEn!: string;
}

export class MedicalRecordDepartmentRefDto {
  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  id!: string;

  @ApiProperty({ example: 'Cardiology' })
  name!: string;
}

export class MedicalRecordResponseDto {
  @ApiProperty({ example: 'fa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  id!: string;

  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  doctorId!: string;

  @ApiProperty({ type: MedicalRecordDoctorRefDto })
  doctor!: MedicalRecordDoctorRefDto;

  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef9999' })
  patientId!: string;

  @ApiProperty({ type: MedicalRecordPatientRefDto })
  patient!: MedicalRecordPatientRefDto;

  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  departmentId!: string;

  @ApiProperty({ type: MedicalRecordDepartmentRefDto })
  department!: MedicalRecordDepartmentRefDto;

  @ApiProperty({ example: '7c8e2a10-1234-5678-9abc-deadbeefcafe' })
  appointmentId!: string;

  @ApiProperty({
    example:
      'Patient presented with mild hypertension. Recommend lifestyle changes ' +
      'and a follow-up in two weeks.',
  })
  note!: string;

  @ApiPropertyOptional({
    example: 'Amlodipine 5mg once daily for 30 days.',
    nullable: true,
  })
  drug!: string | null;

  @ApiProperty({ example: '2026-05-24T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-05-24T08:30:00.000Z' })
  updatedAt!: string;
}
