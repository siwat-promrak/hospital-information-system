import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination';

/**
 * Query DTO for `GET /patients`. Composes the shared pagination
 * contract with a single free-text `q` filter used by the booking
 * wizard's patient picker.
 *
 * The service treats `q` as a case-insensitive `contains` across
 * `firstNameEn` / `lastNameEn` / `firstNameTh` / `lastNameTh` / `phone`
 * / `identificationNo` / `hn` — missing `q` returns the unfiltered
 * paginated list ordered by `createdAt DESC`.
 */
export class ListPatientsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'praewa',
    description:
      'Free-text search across name (en/th), phone, identification number, and HN.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
