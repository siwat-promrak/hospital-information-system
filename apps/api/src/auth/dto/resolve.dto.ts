import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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

/**
 * Payload sent by the Next.js NextAuth `signIn` callback to the API's
 * resolve endpoint. The shape mirrors the subset of the Google profile we
 * actually use to identify and gate the caller.
 */
export class ResolveDto {
  @ApiProperty({ example: 'staff1@gmail.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'g-104983217482983712' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  googleSub!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  emailVerified!: boolean;

  @ApiProperty({ example: 'Pim Sukjai' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: null, nullable: true, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  picture?: string | null;
}

export class ResolveResponseDto {
  @ApiProperty({ example: '0d6b3f7a-2a40-4f74-9036-7d8ae8e29d33' })
  userId!: string;

  @ApiProperty({ example: ROLE.STAFF, enum: SIGN_IN_ELIGIBLE_ROLE_CODES })
  roleCode!: string;

  @ApiProperty({ example: STAFF_PERMISSION_EXAMPLE, type: [String] })
  permissionCodes!: string[];
}
