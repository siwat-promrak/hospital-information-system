import type { PaginationParams } from "@/types/pagination.types";

import { PAGINATION_QUERY_PARAM } from "./pagination.const";

/**
 * Build a URL query suffix (`""` or `?key=value&…`) for a paginated API
 * call. Pagination params come from `PaginationParams`; any extra
 * per-endpoint filter params (e.g. `?departmentId=…`) ride along via
 * `extraParams`.
 *
 * `undefined` and `""` values in `extraParams` are skipped so callers can
 * pass `params?.departmentId` directly without a guard.
 *
 * Returns `""` (not `"?"`) when nothing would be appended so the caller
 * can splat the result into a template string unconditionally.
 */
export function buildPaginationQuery(
  params?: PaginationParams,
  extraParams?: Readonly<Record<string, string | undefined>>,
): string {
  const search = new URLSearchParams();

  if (params?.page !== undefined) {
    search.set(PAGINATION_QUERY_PARAM.PAGE, String(params.page));
  }

  if (params?.pageSize !== undefined) {
    search.set(PAGINATION_QUERY_PARAM.PAGE_SIZE, String(params.pageSize));
  }

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value !== undefined && value !== "") {
        search.set(key, value);
      }
    }
  }

  const qs = search.toString();

  return qs ? `?${qs}` : "";
}
