import { ApiProperty } from '@nestjs/swagger';
import type { Type } from '@nestjs/common';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './pagination.const';
import type { Paginated } from './pagination.types';

/**
 * Abstract Swagger envelope describing the generic paginated response shape.
 * The `data` field is intentionally left undeclared here — each concrete
 * subclass produced by `PaginatedDto(ItemDto)` re-declares it with the
 * correct `type` + `isArray`, which is what makes the generated spec
 * render `data: ItemDto[]` instead of `data: object[]`.
 */
export abstract class PaginatedResponseDto<T> implements Paginated<T> {
  abstract data: T[];

  @ApiProperty({
    description: 'Total matching rows across all pages.',
    example: 42,
  })
  total!: number;

  @ApiProperty({
    description: '1-indexed page that was served.',
    example: DEFAULT_PAGE,
  })
  page!: number;

  @ApiProperty({
    description: 'Page size that was applied for this response.',
    example: DEFAULT_PAGE_SIZE,
    maximum: MAX_PAGE_SIZE,
  })
  pageSize!: number;

  @ApiProperty({
    description:
      'Always `>= 1`. Computed as `Math.max(1, Math.ceil(total / pageSize))`.',
    example: 3,
  })
  totalPages!: number;
}

/**
 * Factory that produces a Swagger-friendly subclass with `data: ItemDto[]`
 * typed against the concrete item DTO. Call sites then reference the
 * factory result inside `ApiOkResponse({ type: PaginatedDto(ItemDto) })`.
 *
 * Memoised per item type so re-invoking the factory for the same DTO does
 * NOT register multiple anonymous schemas in the OpenAPI document.
 */
const PAGINATED_DTO_CACHE = new WeakMap<Type<unknown>, Type<unknown>>();

export function PaginatedDto<T>(itemType: Type<T>): Type<Paginated<T>> {
  const cached = PAGINATED_DTO_CACHE.get(itemType);

  if (cached) {
    return cached as Type<Paginated<T>>;
  }

  class PaginatedDtoImpl extends PaginatedResponseDto<T> {
    @ApiProperty({ type: itemType, isArray: true })
    declare data: T[];
  }

  // Give the synthetic class a unique, debuggable name so the generated
  // OpenAPI spec doesn't render every paginated envelope as `PaginatedDtoImpl`.
  Object.defineProperty(PaginatedDtoImpl, 'name', {
    value: `Paginated${itemType.name}Dto`,
  });

  PAGINATED_DTO_CACHE.set(itemType, PaginatedDtoImpl);

  return PaginatedDtoImpl as Type<Paginated<T>>;
}
