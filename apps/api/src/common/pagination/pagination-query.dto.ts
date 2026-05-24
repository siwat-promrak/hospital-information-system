import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './pagination.const';

/**
 * Shared query DTO for offset-based pagination. Compose via inheritance
 * (`class ListFooQueryDto extends PaginationQueryDto { ... }`) so every
 * paginated endpoint accepts the same `?page=&pageSize=` contract and
 * routes the same validation errors through the global ValidationPipe.
 *
 * Both fields are optional — the service layer applies
 * `DEFAULT_PAGE` / `DEFAULT_PAGE_SIZE` when undefined.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: '1-indexed page number.',
    minimum: 1,
    default: DEFAULT_PAGE,
    example: DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Rows per page.',
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    example: DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}
