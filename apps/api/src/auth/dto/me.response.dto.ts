import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ROLE } from '../roles';

/**
 * Embedded clinical-record reference on the `MeResponseDto`. Only DOCTOR
 * users carry this — other roles return `null` here. Mirrors
 * `AuthenticatedDoctor` from `users.types.ts`; the interface drives
 * `request.user`, this DTO drives the OpenAPI schema.
 */
export class MeDoctorRefDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  id!: string;

  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  departmentId!: string;
}

/**
 * `GET /me` response. Mirrors `AuthenticatedUser` from `users.types.ts`:
 * the interface is the per-request runtime shape (driven by `JwtGuard`),
 * this DTO is the OpenAPI / wire mirror so `@nestjs/swagger` reflects
 * the right schema. The two MUST stay structurally identical — adding a
 * field to `AuthenticatedUser` requires adding the same field here.
 */
export class MeResponseDto {
  @ApiProperty({ example: '0d6b3f7a-2a40-4f74-9036-7d8ae8e29d33' })
  id!: string;

  @ApiProperty({ example: 'nurse1@gmail.com' })
  email!: string;

  @ApiProperty({ example: 'role-nurse-uuid' })
  roleId!: string;

  @ApiProperty({ example: ROLE.NURSE })
  roleCode!: string;

  @ApiProperty({ example: 'Pim' })
  firstNameEn!: string;

  @ApiProperty({ example: 'Sukjai' })
  lastNameEn!: string;

  @ApiPropertyOptional({ example: 'พิม', nullable: true })
  firstNameTh!: string | null;

  @ApiPropertyOptional({ example: 'สุขใจ', nullable: true })
  lastNameTh!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  picture!: string | null;

  @ApiPropertyOptional({
    example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
    nullable: true,
    description:
      'User.departmentId — NURSE / DOCTOR users carry a non-null value; ' +
      'ADMIN / MEDICAL_RECORDS_OFFICER / PHARMACY return null.',
  })
  departmentId!: string | null;

  @ApiProperty({
    example: [
      'appointment.create.own-department',
      'patient.read',
    ],
    type: [String],
  })
  permissionCodes!: string[];

  @ApiPropertyOptional({ type: MeDoctorRefDto, nullable: true })
  doctor!: MeDoctorRefDto | null;
}
