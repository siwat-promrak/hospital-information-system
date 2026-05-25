import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_ALL,
  type PageSizeAll,
} from './pagination.const';
import type { Paginated } from './pagination.types';

/**
 * Normalised pagination inputs after defaults + clamping. Returned by
 * `resolvePagination` so a service can dispatch a single
 * `findMany({ skip, take })` + `count()` round-trip without re-deriving
 * the offsets per call site.
 *
 * `take` is `undefined` when `pageSize === PAGE_SIZE_ALL` so the row fetch
 * runs with no LIMIT — Prisma treats `take: undefined` as "no limit". The
 * companion `pageSize` is kept as the sentinel string in that case so
 * `buildPaginatedResponse` can echo back the correct numeric value once
 * `total` is known.
 */
export interface ResolvedPagination {
  page: number;
  pageSize: number | PageSizeAll;
  skip: number;
  take: number | undefined;
}

/**
 * Apply defaults + clamping on top of validated controller input. The
 * `ValidationPipe` already enforces `>= 1` and `<= MAX_PAGE_SIZE` for
 * present numeric values; this helper exists so the service layer can be
 * called directly (e.g. from tests / internal jobs) without re-applying
 * defaults.
 *
 * When `pageSize === PAGE_SIZE_ALL`, `page` is forced to 1 (page indexing
 * is meaningless once paging is disabled) and `take` is `undefined`.
 */
export function resolvePagination(input?: {
  page?: number;
  pageSize?: number | PageSizeAll;
}): ResolvedPagination {
  if (input?.pageSize === PAGE_SIZE_ALL) {
    return {
      page: 1,
      pageSize: PAGE_SIZE_ALL,
      skip: 0,
      take: undefined,
    };
  }

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
 *
 * When the request used the `PAGE_SIZE_ALL` sentinel, the response always
 * echoes `page = 1`, `pageSize = total`, and `totalPages = 1` — the
 * response shape stays numeric so FE consumers don't need to special-case
 * the wire payload.
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  resolved: Pick<ResolvedPagination, 'page' | 'pageSize'>,
): Paginated<T> {
  if (resolved.pageSize === PAGE_SIZE_ALL) {
    return {
      data,
      total,
      page: 1,
      pageSize: total,
      totalPages: 1,
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / resolved.pageSize));

  return {
    data,
    total,
    page: resolved.page,
    pageSize: resolved.pageSize,
    totalPages,
  };
}
