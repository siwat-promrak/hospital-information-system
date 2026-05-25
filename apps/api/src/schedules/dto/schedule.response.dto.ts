import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Wire DTOs for the F06 `/schedules` response envelope. These classes ARE
 * the response shape — both the controller return type and the service
 * return type reference `ScheduleResponseDto` directly so OpenAPI and
 * runtime stay in lock-step without a parallel TS interface (Item 6 /
 * Pattern A). Field-level `@ApiProperty` decorators drive the OpenAPI
 * schema.
 */

export class ScheduleDoctorRefDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  id!: string;

  @ApiProperty({ example: 'MD-0001' })
  doctorCode!: string;

  @ApiProperty({ example: 'Anna' })
  firstNameEn!: string;

  @ApiProperty({ example: 'Visit' })
  lastNameEn!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  firstNameTh!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  lastNameTh!: string | null;
}

export class ScheduleDepartmentRefDto {
  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  id!: string;

  @ApiProperty({ example: 'Cardiology' })
  name!: string;

  @ApiPropertyOptional({
    example: 'Heart, vasculature, and cardiovascular procedures.',
    nullable: true,
  })
  description!: string | null;
}

export class ScheduleResponseDto {
  @ApiProperty({ example: 'fa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  id!: string;

  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  doctorId!: string;

  @ApiProperty({ type: ScheduleDoctorRefDto })
  doctor!: ScheduleDoctorRefDto;

  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  departmentId!: string;

  @ApiProperty({ type: ScheduleDepartmentRefDto })
  department!: ScheduleDepartmentRefDto;

  @ApiProperty({ example: '2026-06-01T09:00:00.000Z' })
  startAt!: string;

  @ApiProperty({ example: '2026-06-01T12:00:00.000Z' })
  endAt!: string;

  @ApiProperty({ example: '2026-06-01T10:30:00.000Z', nullable: true })
  breakStartAt!: string | null;

  @ApiProperty({ example: '2026-06-01T11:00:00.000Z', nullable: true })
  breakEndAt!: string | null;

  // F07 slot-finder gate: when `false` the window is visible on the staff
  // calendar but NOT bookable by patients (blocked / on-call / admin-only).
  @ApiProperty({ example: true })
  acceptsBooking!: boolean;

  @ApiProperty({ example: '2026-05-24T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-05-24T08:30:00.000Z' })
  updatedAt!: string;
}
