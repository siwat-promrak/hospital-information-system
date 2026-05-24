import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './pagination.const';
import type { Paginated } from './pagination.types';

/**
 * Normalised pagination inputs after defaults + clamping. Returned by
 * `resolvePagination` so a service can dispatch a single
 * `findMany({ skip, take })` + `count()` round-trip without re-deriving
 * the offsets per call site.
 */
export interface ResolvedPagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * Apply defaults + clamping on top of validated controller input. The
 * `ValidationPipe` already enforces `>= 1` and `<= MAX_PAGE_SIZE` for
 * present values; this helper exists so the service layer can be called
 * directly (e.g. from tests / internal jobs) without re-applying defaults.
 */
export function resolvePagination(input?: {
  page?: number;
  pageSize?: number;
}): ResolvedPagination {
  const page = Math.max(DEFAULT_PAGE, Math.trunc(input?.page ?? DEFAULT_PAGE));
  const rawSize = Math.trunc(input?.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Build the response envelope from the parallel `findMany` + `count`
 * results. `totalPages` is always `>= 1` so the FE can render a stable
 * pagination control even when there are zero rows.
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  resolved: Pick<ResolvedPagination, 'page' | 'pageSize'>,
): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(total / resolved.pageSize));

  return {
    data,
    total,
    page: resolved.page,
    pageSize: resolved.pageSize,
    totalPages,
  };
}
