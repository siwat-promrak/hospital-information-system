import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus, AppointmentType } from '@prisma/client';

/**
 * Wire DTOs for F14 `/appointment-groups`. The classes ARE the response
 * shape — both the controller return type and the service return type
 * reference these DTOs directly so OpenAPI and runtime stay in lock-step
 * without a parallel TS interface (Pattern A).
 *
 * Two top-level responses:
 *   - `AppointmentGroupResponseDto`        — the list row (member count
 *     + latest visit summary embedded).
 *   - `AppointmentGroupDetailResponseDto`  — the detail row (full
 *     chronological member list).
 */

export class AppointmentGroupLatestVisitDto {
  @ApiProperty({ example: '7c8e2a10-1234-5678-9abc-deadbeefcafe' })
  appointmentId!: string;

  @ApiProperty({ example: 2 })
  visitNumber!: number;

  @ApiProperty({ enum: AppointmentStatus, example: AppointmentStatus.BOOKED })
  status!: AppointmentStatus;

  @ApiProperty({ example: '2026-06-15T09:00:00.000Z' })
  startAt!: string;

  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  departmentId!: string;

  @ApiProperty({ example: 'Cardiology' })
  departmentName!: string;

  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  doctorId!: string;

  @ApiProperty({ example: 'Anan' })
  doctorFirstNameEn!: string;

  @ApiProperty({ example: 'Charoen' })
  doctorLastNameEn!: string;
}

export class AppointmentGroupMemberDto {
  @ApiProperty({ example: '7c8e2a10-1234-5678-9abc-deadbeefcafe' })
  id!: string;

  @ApiProperty({ example: 1 })
  visitNumber!: number;

  @ApiProperty({ enum: AppointmentType, example: AppointmentType.CONSULTATION })
  appointmentType!: AppointmentType;

  @ApiProperty({ enum: AppointmentStatus, example: AppointmentStatus.COMPLETED })
  status!: AppointmentStatus;

  @ApiProperty({ example: '2026-06-15T09:00:00.000Z' })
  startAt!: string;

  @ApiProperty({ example: '2026-06-15T09:20:00.000Z' })
  endAt!: string;

  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  departmentId!: string;

  @ApiProperty({ example: 'Cardiology' })
  departmentName!: string;

  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  doctorId!: string;

  @ApiProperty({ example: 'MD-0001' })
  doctorCode!: string;

  @ApiProperty({ example: 'Anan' })
  doctorFirstNameEn!: string;

  @ApiProperty({ example: 'Charoen' })
  doctorLastNameEn!: string;

  @ApiPropertyOptional({
    example: 'bb3d2f17-3c0b-4b4f-a3e8-31f2bbb55ccc',
    nullable: true,
  })
  referredToDepartmentId!: string | null;

  @ApiPropertyOptional({ example: '2026-06-15T10:00:00.000Z', nullable: true })
  referredAt!: string | null;

  @ApiPropertyOptional({
    example: '7c8e2a10-1234-5678-9abc-deadbeefbbbb',
    nullable: true,
  })
  referralFulfilledByAppointmentId!: string | null;
}

export class AppointmentGroupResponseDto {
  @ApiProperty({ example: '8a3e2a10-1234-5678-9abc-deadbeef1111' })
  id!: string;

  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef9999' })
  patientId!: string;

  @ApiProperty({ example: '2026-06-01T10:00:00.000Z' })
  openedAt!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  closedAt!: string | null;

  @ApiProperty({ example: 2 })
  memberCount!: number;

  @ApiProperty({ type: AppointmentGroupLatestVisitDto })
  latestVisit!: AppointmentGroupLatestVisitDto;

  @ApiProperty({ example: '2026-06-01T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-06-15T10:30:00.000Z' })
  updatedAt!: string;
}

export class AppointmentGroupDetailResponseDto {
  @ApiProperty({ example: '8a3e2a10-1234-5678-9abc-deadbeef1111' })
  id!: string;

  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef9999' })
  patientId!: string;

  @ApiProperty({ example: '2026-06-01T10:00:00.000Z' })
  openedAt!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  closedAt!: string | null;

  @ApiProperty({ example: '2026-06-01T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-06-15T10:30:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ type: [AppointmentGroupMemberDto] })
  members!: AppointmentGroupMemberDto[];
}
