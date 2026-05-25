import type { PageSizeAll } from "@/lib/api/pagination.const";

/**
 * Generic pagination envelope returned by every BE list endpoint. Mirrors
 * `Paginated<T>` from `apps/api/src/common/pagination/pagination.types.ts`
 * — hand-mirrored until a future `packages/shared` workspace dedupes.
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
 * Request-side pagination params accepted by every paginated API client
 * in `lib/api/`. Both fields are optional — `undefined` means "let the BE
 * apply its defaults" (see `pagination.const.ts`).
 *
 * `pageSize` accepts the `PAGE_SIZE_ALL` sentinel ("all") in addition to a
 * positive integer. The sentinel asks the BE to return every matching row
 * in one response — useful for date-bounded list calls (schedule calendar)
 * where the filter already caps the row count.
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number | PageSizeAll;
}
