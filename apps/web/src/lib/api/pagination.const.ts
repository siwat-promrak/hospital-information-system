/**
 * FE-side mirror of the canonical pagination constants (see
 * `apps/api/src/common/pagination/pagination.const.ts` for the source of
 * truth). Used by API clients and pagination controls so the
 * query-parameter names + defaults stay in sync across both tiers.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Canonical query-parameter names for paginated endpoints. Referenced by
 * the API client and the `PaginationControl` so a rename here propagates
 * to every URL / request site.
 */
export const PAGINATION_QUERY_PARAM = {
  PAGE: "page",
  PAGE_SIZE: "pageSize",
} as const;
