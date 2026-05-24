import { ApiProperty } from '@nestjs/swagger';

/**
 * Department row returned by `GET /departments` and (per-element) by the
 * `GET /departments/:id/doctors` envelope.
 */
export class DepartmentDto {
  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  id!: string;

  @ApiProperty({ example: 'Cardiology' })
  name!: string;

  @ApiProperty({
    example: 'Adult cardiology, EKG, and stress testing.',
    nullable: true,
    required: false,
  })
  description!: string | null;
}

/**
 * Doctor row returned by `GET /departments/:id/doctors`. Flat — the
 * affiliation's `isPrimary` flag is hoisted onto the doctor row so the
 * frontend can render a "Primary" chip without re-joining.
 */
export class DepartmentDoctorDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  id!: string;

  @ApiProperty({ example: 'MD-0001' })
  doctorCode!: string;

  @ApiProperty({ example: 'Dr. Anna Visit' })
  fullName!: string;

  @ApiProperty({ example: true })
  isPrimary!: boolean;
}
