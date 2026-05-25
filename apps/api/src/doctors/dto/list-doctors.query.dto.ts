import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination';

/**
 * Maximum length accepted for the `?q=` substring filter. 100 is more than
 * enough for a fragment of any human name or doctor code, and rejects
 * pathological inputs before they hit the database.
 */
const DOCTORS_QUERY_MAX_LENGTH = 100;

/**
 * Query DTO for `GET /doctors`. Composes the shared `PaginationQueryDto`
 * (`?page=&pageSize=`) with the optional `?departmentId=` filter and the
 * optional `?q=` case-insensitive substring filter so the controller
 * validates everything in one pipe pass.
 *
 * The `q` value is trimmed up front; empty / whitespace-only strings are
 * normalised to `undefined` so the service layer can short-circuit on a
 * single `undefined` check.
 */
export class ListDoctorsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
    description: 'Restrict to doctors affiliated with this department.',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    description:
      'Case-insensitive substring filter across the doctor name fields ' +
      '(firstNameEn, lastNameEn, firstNameTh, lastNameTh) and doctorCode. ' +
      'Whitespace is trimmed; empty / whitespace-only values are ignored.',
    type: String,
    maxLength: DOCTORS_QUERY_MAX_LENGTH,
    example: 'Smith',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length === 0 ? undefined : trimmed;
  })
  @IsString()
  @MaxLength(DOCTORS_QUERY_MAX_LENGTH)
  q?: string;
}
