import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus, AppointmentType } from '@prisma/client';

/**
 * Wire DTOs for F09 `/appointments`. These classes ARE the response
 * shape — both the controller return type and the service return type
 * reference `AppointmentResponseDto` directly so OpenAPI and runtime
 * stay in lock-step without a parallel TS interface.
 */

export class AppointmentPatientRefDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef9999' })
  id!: string;

  @ApiProperty({ example: '26000011' })
  hn!: string;

  @ApiProperty({ example: 'Praewa' })
  firstNameEn!: string;

  @ApiProperty({ example: 'Boonmee' })
  lastNameEn!: string;

  @ApiPropertyOptional({ example: 'แพรวา', nullable: true })
  firstNameTh!: string | null;

  @ApiPropertyOptional({ example: 'บุญมี', nullable: true })
  lastNameTh!: string | null;
}

export class AppointmentDoctorRefDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  id!: string;

  @ApiProperty({ example: 'MD-0001' })
  doctorCode!: string;

  @ApiProperty({ example: 'Anan' })
  firstNameEn!: string;

  @ApiProperty({ example: 'Charoen' })
  lastNameEn!: string;
}

export class AppointmentDepartmentRefDto {
  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  id!: string;

  @ApiProperty({ example: 'Cardiology' })
  name!: string;
}

export class AppointmentResponseDto {
  @ApiProperty({ example: '7c8e2a10-1234-5678-9abc-deadbeefcafe' })
  id!: string;

  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef9999' })
  patientId!: string;

  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  doctorId!: string;

  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  departmentId!: string;

  @ApiProperty({ example: 'fa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  scheduleId!: string;

  @ApiProperty({ enum: AppointmentType, example: AppointmentType.CONSULTATION })
  appointmentType!: AppointmentType;

  @ApiProperty({ enum: AppointmentStatus, example: AppointmentStatus.BOOKED })
  status!: AppointmentStatus;

  @ApiProperty({ example: '2026-06-15T09:00:00.000Z' })
  startAt!: string;

  @ApiProperty({ example: '2026-06-15T09:20:00.000Z' })
  endAt!: string;

  @ApiPropertyOptional({
    example: 'Routine pacemaker check-up',
    nullable: true,
  })
  reason!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  cancelledAt!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  cancellationReason!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  cancelledBy!: string | null;

  @ApiProperty({ example: 'aa3d2f17-aaaa-4b4f-a3e8-31f2bbb55ccc' })
  createdBy!: string;

  @ApiProperty({ example: '2026-05-24T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-05-24T08:30:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({
    example: '8a3e2a10-1234-5678-9abc-deadbeef1111',
    description: 'F14 — owning appointment group id (NULL on standalone rows).',
    nullable: true,
  })
  appointmentGroupId!: string | null;

  @ApiPropertyOptional({
    example: 2,
    description: 'F14 — 1-indexed visit number within the owning group (NULL on standalone rows).',
    nullable: true,
  })
  visitNumber!: number | null;

  @ApiPropertyOptional({
    example: 'bb3d2f17-3c0b-4b4f-a3e8-31f2bbb55ccc',
    description: 'F14 — destination department of the referral originated from this row.',
    nullable: true,
  })
  referredToDepartmentId!: string | null;

  @ApiPropertyOptional({
    example: '2026-06-15T10:00:00.000Z',
    description: 'F14 — when the referral was initiated.',
    nullable: true,
  })
  referredAt!: string | null;

  @ApiPropertyOptional({
    example: '7c8e2a10-1234-5678-9abc-deadbeefbbbb',
    description:
      'F14 — receiver appointment id once a destination NURSE books the pickup. NULL while pending.',
    nullable: true,
  })
  referralFulfilledByAppointmentId!: string | null;

  @ApiProperty({ type: AppointmentPatientRefDto })
  patient!: AppointmentPatientRefDto;

  @ApiProperty({ type: AppointmentDoctorRefDto })
  doctor!: AppointmentDoctorRefDto;

  @ApiProperty({ type: AppointmentDepartmentRefDto })
  department!: AppointmentDepartmentRefDto;
}
