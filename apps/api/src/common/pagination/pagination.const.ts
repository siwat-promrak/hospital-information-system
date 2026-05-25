/**
 * Shared pagination defaults applied to every list endpoint that consumes
 * `PaginationQueryDto`. Centralised so a tuning change (e.g. raising the
 * page-size ceiling for an admin export) is a single-file edit.
 *
 *  - `DEFAULT_PAGE`     — 1-indexed start page when the caller omits `page`.
 *  - `DEFAULT_PAGE_SIZE`— rows per page when the caller omits `pageSize`.
 *  - `MAX_PAGE_SIZE`    — hard numeric ceiling enforced by the validator
 *    so a client can't blow up the API with `pageSize=1000000`. Only the
 *    `PAGE_SIZE_ALL` sentinel bypasses this bound.
 *  - `PAGE_SIZE_ALL`    — sentinel string ("all") that disables paging and
 *    returns every row matching the rest of the query. Reserved for views
 *    that genuinely need the whole filtered set in one request (e.g. the
 *    F06 schedule calendar's date-window fetch).
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
// 500 is the *numeric* upper bound for `pageSize=<integer>` requests. It
// remains the safety bound for callers that pass a number — `pageSize=all`
// (PAGE_SIZE_ALL) is the only way to bypass it. The calendar relies on
// `pageSize=all` so a populated month / week fits in a single response.
export const MAX_PAGE_SIZE = 500;

/**
 * Sentinel string for "fetch every row matching the filter — no LIMIT".
 * MUST be lowercase and exact-match; class-validator rejects any other
 * string. Mirrored on the FE in `apps/web/src/lib/api/pagination.const.ts`
 * so both tiers reference the same constant.
 */
export const PAGE_SIZE_ALL = 'all' as const;
export type PageSizeAll = typeof PAGE_SIZE_ALL;

/**
 * Canonical query-parameter names for paginated endpoints. Mirrored on the
 * FE in `apps/web/src/types/pagination.const.ts` so the wire contract has a
 * single source of truth on each tier.
 */
export const PAGINATION_QUERY_PARAM = {
  PAGE: 'page',
  PAGE_SIZE: 'pageSize',
} as const;
