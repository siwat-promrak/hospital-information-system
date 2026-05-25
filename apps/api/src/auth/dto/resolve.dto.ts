import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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
