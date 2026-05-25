/**
 * FE-side mirror of the canonical pagination constants (see
 * `apps/api/src/common/pagination/pagination.const.ts` for the source of
 * truth). Used by API clients and pagination controls so the
 * query-parameter names + defaults stay in sync across both tiers.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
// 500 supports the schedule calendar's "fetch a date window" pattern —
// see apps/api/src/common/pagination/pagination.const.ts for the why.
export const MAX_PAGE_SIZE = 500;

/**
 * Sentinel value for `pageSize` that asks the BE to return every matching
 * row in a single response, bypassing the `MAX_PAGE_SIZE` cap. Used by the
 * schedule calendar so a month/week window always fits in one round-trip
 * (the `from` / `to` filter already bounds the row count).
 *
 * Mirrors the BE constant of the same value — drift here means a 400.
 */
export const PAGE_SIZE_ALL = "all" as const;
export type PageSizeAll = typeof PAGE_SIZE_ALL;

/**
 * Canonical query-parameter names for paginated endpoints. Referenced by
 * the API client and the `PaginationControl` so a rename here propagates
 * to every URL / request site.
 */
export const PAGINATION_QUERY_PARAM = {
  PAGE: "page",
  PAGE_SIZE: "pageSize",
} as const;
