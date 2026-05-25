import { ApiProperty } from '@nestjs/swagger';

/**
 * Department row returned by `GET /departments`.
 *
 * "Doctors in a department" is served by `GET /doctors?departmentId=`
 * (see `DoctorResponseDto` + its `departments` affiliation list) — the
 * previous `DepartmentDoctorDto` companion was retired to keep a single
 * canonical lookup for that view.
 */
export class DepartmentResponseDto {
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
