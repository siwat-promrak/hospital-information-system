"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { loadDoctorsPageAction } from "@/lib/api/doctor.actions";
import { DOCTOR_INFINITE_SCROLL_PAGE_SIZE } from "@/lib/api/doctor.const";
import type { DoctorListRow } from "@/types/doctor.types";

interface UseIncrementalDoctorListArgs {
  /**
   * First page of doctors fetched on the server. The hook resets its
   * local cursor + list whenever this reference changes (e.g. the parent
   * re-renders with a new department filter).
   */
  initialDoctors: readonly DoctorListRow[];
  /**
   * Total doctor count behind the current `departmentId` subset. Drives
   * the `hasMore` flip and the caller-rendered "Showing X of Y" hint.
   */
  total: number;
  /**
   * Page the SSR `initialDoctors` payload corresponds to (typically `1`).
   * Threaded so the hook knows which page to request next.
   */
  initialPage: number;
  /**
   * Optional department filter forwarded to incremental fetches so paged
   * results stay scoped to the same subset SSR used. `undefined` matches
   * "all departments".
   */
  departmentId?: string;
}

interface UseIncrementalDoctorListResult {
  /** Doctors loaded so far (SSR page + every appended page). */
  loaded: readonly DoctorListRow[];
  /** `true` while a `loadMore()` fetch is in flight. */
  isLoadingMore: boolean;
  /** `true` when more pages exist beyond `loaded`. */
  hasMore: boolean;
  /**
   * Trigger the next-page fetch. Guards against double-firing (StrictMode
   * + momentum scroll) and silently swallows transient network errors —
   * callers typically just keep the dropdown at its current page and let
   * the user retry by scrolling further.
   */
  loadMore: () => Promise<void>;
}

/**
 * Shared infinite-scroll state machine for the doctor picker. Wraps the
 * `loadDoctorsPageAction` server action behind a hook so the schedule
 * form dialog AND the page-level doctor filter share one implementation
 * of the dedup-on-append + reset-on-prop-change semantics.
 *
 * Dedup discipline: appended pages are filtered against the ids already
 * in `loaded` so a repeated `loadMore()` (StrictMode in dev, double-scroll
 * race, BE row shifted between pages) can't introduce duplicate rows.
 * Existing entries win so any in-place reference held by the caller
 * (e.g. the form dialog's `selectedDoctor` lookup) stays valid.
 *
 * Reset trigger: the local cursor + list reset whenever `initialDoctors`
 * or `initialPage` change identity. SSR reference equality is stable per
 * server render, so the reset only fires on real changes (a department
 * filter flip, a mutation revalidate).
 */
export function useIncrementalDoctorList({
  initialDoctors,
  total,
  initialPage,
  departmentId,
}: UseIncrementalDoctorListArgs): UseIncrementalDoctorListResult {
  const [loaded, setLoaded] = useState<readonly DoctorListRow[]>(
    initialDoctors,
  );
  const [page, setPage] = useState<number>(initialPage);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  // De-bounce flag — a guard at the call site is cheaper than rerendering
  // the consumer. `useMemo` with empty deps keeps the same ref identity
  // for the lifetime of the hook.
  const fetchInFlight = useMemo(() => ({ current: false }), []);

  useEffect(() => {
    setLoaded(initialDoctors);
    setPage(initialPage);
    setIsLoadingMore(false);
    fetchInFlight.current = false;
  }, [initialDoctors, initialPage, fetchInFlight]);

  const hasMore = loaded.length < total;

  const loadMore = useCallback(async () => {
    if (fetchInFlight.current || !hasMore) {
      return;
    }

    fetchInFlight.current = true;
    setIsLoadingMore(true);

    try {
      const nextPage = page + 1;
      const response = await loadDoctorsPageAction({
        page: nextPage,
        pageSize: DOCTOR_INFINITE_SCROLL_PAGE_SIZE,
        departmentId,
      });

      setLoaded((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        const additions = response.data.filter((d) => !seen.has(d.id));

        return [...prev, ...additions];
      });
      setPage(nextPage);
    } catch {
      // Swallow — the dropdown stays at its current page and the user
      // can keep typing / scrolling. A transient hiccup shouldn't block
      // a modal that's primarily about scheduling, not browsing.
    } finally {
      setIsLoadingMore(false);
      fetchInFlight.current = false;
    }
  }, [fetchInFlight, hasMore, page, departmentId]);

  return { loaded, isLoadingMore, hasMore, loadMore };
}
