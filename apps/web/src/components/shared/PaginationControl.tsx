"use client";

import Box from "@mui/material/Box";
import Pagination from "@mui/material/Pagination";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { PAGINATION_QUERY_PARAM } from "@/lib/api/pagination.const";

interface PaginationControlProps {
  /** Current 1-indexed page being rendered. */
  page: number;
  /**
   * Total pages from the BE envelope. The control hides itself when this
   * is `<= 1` so a single-page list doesn't render a useless widget.
   */
  totalPages: number;
  /**
   * Path the locale-aware router should `replace` to (e.g. `/doctors`).
   * The locale segment is added automatically by `next-intl`'s router.
   */
  basePath: string;
  /**
   * Query params to preserve across page changes (e.g. `departmentId`).
   * Undefined values are dropped so cleared filters don't linger in the
   * URL. The `page` key is reserved and managed by this component.
   */
  preservedQuery?: Record<string, string | undefined>;
}

/**
 * Shared offset-pagination control. Wraps MUI `<Pagination />` and pushes
 * `?page=N` updates through next-intl's locale-aware router so the URL
 * remains the canonical source of truth for the current page (back /
 * forward and shareable links Just Work).
 *
 * Responsive: centered + full-width on `xs`, right-aligned on `md+`.
 */
export default function PaginationControl({
  page,
  totalPages,
  basePath,
  preservedQuery,
}: PaginationControlProps) {
  const tPagination = useTranslations(NS.Pagination);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (totalPages <= 1) {
    return null;
  }

  function handleChange(_event: React.ChangeEvent<unknown>, nextPage: number) {
    const search = new URLSearchParams();

    if (preservedQuery) {
      for (const [key, value] of Object.entries(preservedQuery)) {
        if (value !== undefined && value !== "") {
          search.set(key, value);
        }
      }
    }

    search.set(PAGINATION_QUERY_PARAM.PAGE, String(nextPage));

    startTransition(() => {
      router.replace(`${basePath}?${search.toString()}`);
    });
  }

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: { xs: "center", md: "flex-end" },
        width: "100%",
      }}
    >
      <Pagination
        page={page}
        count={totalPages}
        onChange={handleChange}
        disabled={isPending}
        color="primary"
        shape="rounded"
        size="small"
        siblingCount={1}
        boundaryCount={1}
        aria-label={tPagination(K.Pagination.ariaLabel)}
        getItemAriaLabel={(type, itemPage, selected) => {
          if (type === "previous") {
            return tPagination(K.Pagination.previous);
          }

          if (type === "next") {
            return tPagination(K.Pagination.next);
          }

          if (type === "first") {
            return tPagination(K.Pagination.first);
          }

          if (type === "last") {
            return tPagination(K.Pagination.last);
          }

          const labelPage = itemPage ?? 0;

          if (selected) {
            return tPagination(K.Pagination.currentPage, { page: labelPage });
          }

          return tPagination(K.Pagination.gotoPage, { page: labelPage });
        }}
      />
    </Box>
  );
}
