import { ApiProperty } from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';

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

  /**
   * The `AppointmentType` enum values this department offers — the
   * `department_appointment_types` join table per-row. Consumed by the
   * booking wizard to filter the type Select to only the types the
   * picked department actually supports; submitting a mismatched
   * `(departmentId, appointmentType)` still 400s on the BE with
   * `DEPARTMENT_TYPE_NOT_ALLOWED`, but the FE narrowing prevents the
   * round-trip when the catalog already proves the pair is unsupported.
   */
  @ApiProperty({
    enum: AppointmentType,
    isArray: true,
    example: ['NEW_PATIENT_VISIT', 'FOLLOW_UP', 'CONSULTATION', 'PROCEDURE'],
    description:
      'Set of AppointmentType codes this department offers; drives the booking wizard type filter.',
  })
  allowedAppointmentTypes!: AppointmentType[];
}
