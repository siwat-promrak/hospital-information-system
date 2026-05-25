import { ApiProperty } from '@nestjs/swagger';

import { PERMISSION } from '../permissions';
import { ROLE, SIGN_IN_ELIGIBLE_ROLES } from '../roles';

const SIGN_IN_ELIGIBLE_ROLE_CODES: readonly string[] = SIGN_IN_ELIGIBLE_ROLES;

const STAFF_PERMISSION_EXAMPLE: readonly string[] = [
  PERMISSION.APPOINTMENT_CREATE,
  PERMISSION.APPOINTMENT_CANCEL,
  PERMISSION.APPOINTMENT_LIST,
  PERMISSION.APPOINTMENT_READ,
  PERMISSION.SCHEDULE_MANAGE,
  PERMISSION.PATIENT_CREATE,
  PERMISSION.PATIENT_READ,
  PERMISSION.PATIENT_UPDATE,
  PERMISSION.PATIENT_LIST,
  PERMISSION.DOCTOR_READ,
  PERMISSION.DOCTOR_LIST,
];

export class ResolveResponseDto {
  @ApiProperty({ example: '0d6b3f7a-2a40-4f74-9036-7d8ae8e29d33' })
  userId!: string;

  @ApiProperty({ example: ROLE.STAFF, enum: SIGN_IN_ELIGIBLE_ROLE_CODES })
  roleCode!: string;

  @ApiProperty({ example: STAFF_PERMISSION_EXAMPLE, type: [String] })
  permissionCodes!: string[];
}
