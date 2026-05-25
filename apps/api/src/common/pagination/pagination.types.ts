import type { PageSizeAll } from './pagination.const';

/**
 * Generic envelope returned by every paginated list endpoint. Mirrored on
 * the FE in `apps/web/src/types/pagination.types.ts` so the wire contract
 * stays in sync until a future `packages/shared` workspace dedupes.
 *
 *  - `data`       — current page of rows (length `<= pageSize`).
 *  - `total`      — total matching rows across all pages (post-filter).
 *  - `page`       — the page that was served (1-indexed).
 *  - `pageSize`   — the cap that was applied for this response.
 *  - `totalPages` — `Math.max(1, Math.ceil(total / pageSize))`. Always
 *    `>= 1` so the FE can render a stable pagination control even when
 *    `total === 0`.
 */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Canonical service-layer pagination input. Every `List*Args` interface
 * in a feature module MUST `extends PaginationParams` instead of
 * re-declaring `page` / `pageSize` so a rename surfaces in one place.
 *
 * Shape matches `PaginationQueryDto` (controller side) and
 * `resolvePagination` input (service side) — both helpers accept
 * `PaginationParams` directly.
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number | PageSizeAll;
}
