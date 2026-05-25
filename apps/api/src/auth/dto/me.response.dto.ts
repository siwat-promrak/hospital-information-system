import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ROLE } from '../roles';

/**
 * Embedded clinical-record reference on the `MeResponseDto`. Only DOCTOR
 * users carry this — STAFF / ADMIN return `null` here. Mirrors
 * `AuthenticatedDoctor` from `users.types.ts`; the interface drives
 * `request.user`, this DTO drives the OpenAPI schema.
 */
export class MeDoctorRefDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  id!: string;
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

  @ApiProperty({ example: 'staff1@gmail.com' })
  email!: string;

  @ApiProperty({ example: 'role-staff-uuid' })
  roleId!: string;

  @ApiProperty({ example: ROLE.STAFF })
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

  @ApiProperty({ example: ['appointment.create', 'patient.list'], type: [String] })
  permissionCodes!: string[];

  @ApiPropertyOptional({ type: MeDoctorRefDto, nullable: true })
  doctor!: MeDoctorRefDto | null;
}
