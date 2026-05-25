import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

import { IsPageSize } from './decorators/page-size.decorator';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_ALL,
  type PageSizeAll,
} from './pagination.const';

/**
 * Shared query DTO for offset-based pagination. Compose via inheritance
 * (`class ListFooQueryDto extends PaginationQueryDto { ... }`) so every
 * paginated endpoint accepts the same `?page=&pageSize=` contract and
 * routes the same validation errors through the global ValidationPipe.
 *
 * Both fields are optional — the service layer applies
 * `DEFAULT_PAGE` / `DEFAULT_PAGE_SIZE` when undefined.
 *
 * `pageSize` is a union: an integer in `[1, MAX_PAGE_SIZE]` OR the
 * sentinel string `PAGE_SIZE_ALL` ("all") which disables paging entirely
 * and returns every row matching the rest of the filter. The custom
 * `@Transform` below keeps `"all"` as a string while coercing every other
 * input to a `Number`, then `@IsPageSize()` enforces the union.
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
    description:
      `Rows per page. Either an integer in [1, ${MAX_PAGE_SIZE}] OR the ` +
      `sentinel string "${PAGE_SIZE_ALL}" to return every matching row in ` +
      'one response (used by views that need a full filtered window, e.g. ' +
      'the F06 schedule calendar).',
    default: DEFAULT_PAGE_SIZE,
    example: DEFAULT_PAGE_SIZE,
    oneOf: [
      { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE },
      { type: 'string', enum: [PAGE_SIZE_ALL] },
    ],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === PAGE_SIZE_ALL) {
      return PAGE_SIZE_ALL;
    }

    if (value === undefined || value === null || value === '') {
      return value;
    }

    const num = Number(value);

    return Number.isNaN(num) ? value : num;
  })
  @IsPageSize()
  pageSize?: number | PageSizeAll;
}
