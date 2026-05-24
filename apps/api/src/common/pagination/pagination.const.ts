/**
 * Shared pagination defaults applied to every list endpoint that consumes
 * `PaginationQueryDto`. Centralised so a tuning change (e.g. raising the
 * page-size ceiling for an admin export) is a single-file edit.
 *
 *  - `DEFAULT_PAGE`     — 1-indexed start page when the caller omits `page`.
 *  - `DEFAULT_PAGE_SIZE`— rows per page when the caller omits `pageSize`.
 *  - `MAX_PAGE_SIZE`    — hard ceiling enforced by the validator so a
 *    client can't blow up the API with `pageSize=1000000`.
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Canonical query-parameter names for paginated endpoints. Mirrored on the
 * FE in `apps/web/src/types/pagination.const.ts` so the wire contract has a
 * single source of truth on each tier.
 */
export const PAGINATION_QUERY_PARAM = {
  PAGE: 'page',
  PAGE_SIZE: 'pageSize',
} as const;
