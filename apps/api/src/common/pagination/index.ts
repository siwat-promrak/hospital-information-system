/**
 * Public barrel for the shared pagination scaffolding. Consumers should
 * import from `'../common/pagination'` so the underlying split between
 * dto / types / consts / util stays an internal concern.
 */

export {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGINATION_QUERY_PARAM,
} from './pagination.const';
export { PaginationQueryDto } from './pagination-query.dto';
export { PaginatedDto, PaginatedResponseDto } from './paginated-response.dto';
export type { Paginated } from './pagination.types';
export {
  buildPaginatedResponse,
  resolvePagination,
} from './pagination.util';
export type { ResolvedPagination } from './pagination.util';
