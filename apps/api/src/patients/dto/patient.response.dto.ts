import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BloodGroup, Gender } from '@prisma/client';

/**
 * Wire DTO for `POST /patients` (201) and `GET /patients/:id` (200 —
 * future) responses. The list endpoint paginates this same shape via
 * `PaginatedDto(PatientResponseDto)`.
 *
 * `dateOfBirth` is serialised as the ISO calendar-date string
 * (`YYYY-MM-DD`) — the DB column is `Date` (no time component) and the
 * BE never invents a time-of-day for it.
 *
 * Audit fields (`createdBy`, `updatedBy`, `deletedAt`, …) are
 * intentionally NOT on the wire — patients are operator-managed and the
 * FE never needs to render the audit trail.
 */
export class PatientResponseDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef9999' })
  id!: string;

  @ApiProperty({
    example: '26000011',
    description: 'Hospital Number — `<YY><sequence>` zero-padded.',
  })
  hn!: string;

  @ApiProperty({ example: 'Praewa' })
  firstNameEn!: string;

  @ApiProperty({ example: 'Boonmee' })
  lastNameEn!: string;

  @ApiPropertyOptional({ example: 'แพรวา', nullable: true })
  firstNameTh!: string | null;

  @ApiPropertyOptional({ example: 'บุญมี', nullable: true })
  lastNameTh!: string | null;

  @ApiPropertyOptional({ example: 'praewa@example.com', nullable: true })
  email!: string | null;

  @ApiProperty({
    example: '1990-01-15',
    description: 'ISO calendar date (`YYYY-MM-DD`).',
  })
  dateOfBirth!: string;

  @ApiProperty({ enum: Gender, example: Gender.FEMALE })
  gender!: Gender;

  @ApiProperty({ enum: BloodGroup, example: BloodGroup.O_POSITIVE })
  bloodGroup!: BloodGroup;

  @ApiProperty({ example: '1100800123456' })
  identificationNo!: string;

  @ApiProperty({ example: '+66-2-555-1234' })
  phone!: string;

  @ApiProperty({ example: 'Anan Boonmee' })
  emergencyPersonName!: string;

  @ApiProperty({ example: 'Spouse' })
  emergencyPersonRelation!: string;

  @ApiProperty({ example: '+66-2-555-9999' })
  emergencyPersonPhone!: string;

  @ApiProperty({ example: '123 Example Road, Bangkok 10110' })
  address!: string;

  @ApiProperty({ example: '2026-05-24T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-05-24T08:30:00.000Z' })
  updatedAt!: string;
}
