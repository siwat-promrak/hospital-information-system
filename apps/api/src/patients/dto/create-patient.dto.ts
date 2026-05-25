import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BloodGroup, Gender } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Request body for `POST /patients` — front-desk walk-in registration.
 *
 * - `hn` is NOT on the wire — the service mints it (`<YY><sequence>`,
 *   zero-padded to 8 chars).
 * - `email` is optional; when present the service lowercases + trims
 *   via `normalizeEmail()` and rejects duplicates with `409
 *   PATIENT_EMAIL_EXISTS`.
 * - `bloodGroup` defaults to `UNKNOWN` server-side when omitted (the
 *   schema's column default backs it up).
 * - `identificationNo` is free-text by spec — Thai national ID
 *   or passport; no class-validator check beyond required.
 */
export class CreatePatientDto {
  @ApiProperty({ example: 'Praewa' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  firstNameEn!: string;

  @ApiProperty({ example: 'Boonmee' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  lastNameEn!: string;

  @ApiPropertyOptional({ example: 'แพรวา', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  firstNameTh?: string | null;

  @ApiPropertyOptional({ example: 'บุญมี', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  lastNameTh?: string | null;

  @ApiPropertyOptional({
    example: 'praewa@example.com',
    nullable: true,
    description:
      'Optional email. Stored lowercased + trimmed; duplicate addresses ' +
      'are rejected with `409 PATIENT_EMAIL_EXISTS`.',
  })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({
    example: '1990-01-15',
    description: 'ISO calendar date (`YYYY-MM-DD`).',
  })
  @IsDateString()
  dateOfBirth!: string;

  @ApiProperty({ enum: Gender, example: Gender.FEMALE })
  @IsEnum(Gender)
  gender!: Gender;

  @ApiPropertyOptional({
    enum: BloodGroup,
    example: BloodGroup.O_POSITIVE,
    description: 'Defaults to `UNKNOWN` when omitted.',
  })
  @IsOptional()
  @IsEnum(BloodGroup)
  bloodGroup?: BloodGroup;

  @ApiProperty({
    example: '1100800123456',
    description: 'Thai national ID or passport — freeform.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  identificationNo!: string;

  @ApiProperty({ example: '+66-2-555-1234' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phone!: string;

  @ApiProperty({ example: 'Anan Boonmee' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  emergencyPersonName!: string;

  @ApiProperty({ example: 'Spouse' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  emergencyPersonRelation!: string;

  @ApiProperty({ example: '+66-2-555-9999' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  emergencyPersonPhone!: string;

  @ApiProperty({ example: '123 Example Road, Bangkok 10110' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  address!: string;
}
