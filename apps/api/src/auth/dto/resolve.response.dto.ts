import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PERMISSION } from '../permissions';
import { ROLE, SIGN_IN_ELIGIBLE_ROLES } from '../roles';

const SIGN_IN_ELIGIBLE_ROLE_CODES: readonly string[] = SIGN_IN_ELIGIBLE_ROLES;

const NURSE_PERMISSION_EXAMPLE: readonly string[] = [
  PERMISSION.SCHEDULE_CREATE_OWN_DEPARTMENT,
  PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
  PERMISSION.SCHEDULE_UPDATE_OWN_DEPARTMENT,
  PERMISSION.SCHEDULE_DELETE_OWN_DEPARTMENT,
  PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
  PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
  PERMISSION.APPOINTMENT_UPDATE_OWN_DEPARTMENT,
  PERMISSION.APPOINTMENT_DELETE_OWN_DEPARTMENT,
  PERMISSION.PATIENT_CREATE,
  PERMISSION.PATIENT_READ,
  PERMISSION.PATIENT_UPDATE,
  PERMISSION.PATIENT_DELETE,
  PERMISSION.DOCTOR_READ,
  PERMISSION.MEDICAL_RECORDS_READ_ALL,
];

export class ResolveResponseDto {
  @ApiProperty({ example: '0d6b3f7a-2a40-4f74-9036-7d8ae8e29d33' })
  userId!: string;

  @ApiProperty({ example: ROLE.NURSE, enum: SIGN_IN_ELIGIBLE_ROLE_CODES })
  roleCode!: string;

  @ApiProperty({ example: NURSE_PERMISSION_EXAMPLE, type: [String] })
  permissionCodes!: string[];

  @ApiPropertyOptional({
    example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
    nullable: true,
    description:
      'User.departmentId — DOCTOR / NURSE carry a non-null value; ' +
      'ADMIN / MEDICAL_RECORDS_OFFICER / PHARMACY return null. The FE ' +
      'persists this on the session JWT so server components can scope ' +
      'list filters (e.g. the /schedules doctor picker) to the caller\'s ' +
      'home department without a second /me round-trip.',
  })
  departmentId!: string | null;
}
