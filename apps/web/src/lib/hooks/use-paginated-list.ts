"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_PAGE_SIZE } from "@/lib/api/pagination.const";
import type { Paginated } from "@/types/pagination.types";

/**
 * Optional SSR seed for page 1. The hook uses it on FIRST render only, while
 * the caller's `resetKey` still matches the value captured at mount. Once
 * the caller bumps `resetKey` (e.g. filter / query change), the seed is
 * permanently discarded and page 1 is refetched via `loadPage`.
 */
export interface PaginatedListInitial<T> {
  /** First page of rows the server pre-fetched. */
  data: readonly T[];
  /** Page number the seed corresponds to — typically `1`. */
  page: number;
  /** Total rows matching the SSR fetch's filter — drives the `hasMore` flip. */
  total: number;
}

export interface UsePaginatedListArgs<T> {
  /**
   * Closure-based page loader. The caller captures any filter / query state
   * in this closure — the hook never knows about filters, so it never needs
   * an adapter object or a generic filter type. When the caller wants to
   * re-narrow, they bump `resetKey` and pass a new `loadPage` closure that
   * captures the new state.
   */
  loadPage: (args: { page: number; pageSize: number }) => Promise<Paginated<T>>;
  /**
   * Optional SSR seed for page 1. Used on FIRST render only; once `resetKey`
   * changes, the hook refetches page 1 via `loadPage` and the seed is
   * discarded.
   */
  initial?: PaginatedListInitial<T>;
  /** Stable id extractor so the dedup-on-append set is correct. */
  getKey: (item: T) => string;
  /**
   * When this changes, the hook resets the cursor + loaded list back to
   * page 1 and refetches. The caller composes it from filter / query state,
   * typically via a small JSON.stringify or template-literal.
   */
  resetKey: string;
  /** Page size threaded through every `loadPage` call. Defaults to 20. */
  pageSize?: number;
  /**
   * When `true` AND no `initial` seed was provided, the hook fires `loadPage`
   * for page 1 on first mount so the consumer doesn't render an empty list
   * waiting for a manual `loadMore()`. The default is `false` so existing
   * call sites that rely on "show empty until user triggers fetch" semantics
   * (e.g. `PatientPicker`'s typeahead, which waits for the user to type
   * before searching) keep working unchanged. Entity wrappers like
   * `<DoctorSelect>` opt in so the picker populates immediately when the
   * caller doesn't pass an SSR seed (modals opened below the fold, picker
   * call sites where SSR wasn't worth the round-trip).
   */
  autoFetchFirstPage?: boolean;
}

export interface UsePaginatedListResult<T> {
  /** Rows loaded so far (SSR seed + every appended page). */
  loaded: readonly T[];
  /** Total matching rows behind the current filter / query. */
  total: number;
  /** `true` when more pages exist beyond `loaded`. */
  hasMore: boolean;
  /** `true` while a `loadMore()` fetch is in flight. */
  isLoadingMore: boolean;
  /**
   * Trigger the next-page fetch. Guards against double-firing (StrictMode
   * + momentum scroll) and silently swallows transient network errors —
   * callers typically just keep the dropdown at its current page and let
   * the user retry by scrolling further.
   */
  loadMore: () => Promise<void>;
  /**
   * Programmatic reset — re-fetches page 1 via `loadPage`, replaces
   * `loaded` with the response, resets cursor + flags. Used when the
   * caller wants to refresh on demand without bumping `resetKey`.
   */
  reset: () => Promise<void>;
}

/**
 * Generic infinite-scroll state machine for paginated list endpoints. Owns
 * the page cursor, the appended `loaded` array, the dedup-on-append set,
 * and the in-flight debounce. The caller passes a closure that captures
 * any filter / query state and returns a `Paginated<T>` — the hook stays
 * free of domain knowledge (no `departmentId`, no `q`, no entity type).
 *
 * Dedup discipline: appended pages are filtered against the keys already
 * in `loaded` so a repeated `loadMore()` (StrictMode in dev, double-scroll
 * race, BE row shifted between pages) can't introduce duplicate rows.
 * Existing entries win so any in-place reference held by the caller (e.g.
 * a form's `selectedDoctor` lookup) stays valid.
 *
 * Reset semantics:
 *  - `resetKey` change: cursor + loaded list + flags all reset, then the
 *    hook re-fetches page 1 via `loadPage` (the seed is permanently
 *    discarded after the first reset).
 *  - `reset()` programmatic call: same path — re-fetches page 1 via
 *    `loadPage`, replaces `loaded` with the response. Caller exposes this
 *    when they want to refresh on demand (e.g. after a mutation).
 *
 * SSR seed lifetime: while `resetKey === initialResetKey` (the value
 * captured on first render) AND the consumer has never diverged from
 * that initial value, the hook serves the seed verbatim. As soon as the
 * caller bumps `resetKey`, an internal "has diverged" flag flips and the
 * seed is discarded permanently — even if the caller later sets
 * `resetKey` back to its original value, the hook refetches fresh page-1
 * data via `loadPage` instead of replaying the stale seed. This is what
 * keeps a filter cascade (e.g. doctor picker scoped by department) honest
 * across pick → clear → re-pick sequences.
 */
export function usePaginatedList<T>({
  loadPage,
  initial,
  getKey,
  resetKey,
  pageSize = DEFAULT_PAGE_SIZE,
  autoFetchFirstPage = false,
}: UsePaginatedListArgs<T>): UsePaginatedListResult<T> {
  // Snapshot the resetKey on first render — while the live resetKey
  // matches this AND the consumer hasn't diverged yet, the SSR seed (or
  // "wait for input" empty state) is the source of truth and we don't
  // refetch page 1. Refs outlive renders so React's StrictMode
  // double-mount doesn't re-snapshot them.
  const initialResetKeyRef = useRef<string>(resetKey);
  const seedConsumedRef = useRef<boolean>(false);
  // `hasDivergedRef` flips `true` the first time `resetKey` strays from
  // the captured initial value. Once it's `true`, the hook treats EVERY
  // subsequent resetKey change as a real refetch trigger — even when the
  // user returns to the initial resetKey. Without this, e.g. picking
  // DEPT_A in an MRO filter card (initial resetKey = "") then clearing
  // the field (resetKey back to "") would land in the "skip fetch"
  // branch and leave the listbox stuck on DEPT_A's doctors.
  const hasDivergedRef = useRef<boolean>(false);

  const [loaded, setLoaded] = useState<readonly T[]>(initial?.data ?? []);
  const [total, setTotal] = useState<number>(initial?.total ?? 0);
  const [page, setPage] = useState<number>(initial?.page ?? 1);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  // De-bounce flag — a guard at the call site is cheaper than rerendering
  // the consumer. `useMemo` with empty deps keeps the same ref identity
  // for the lifetime of the hook.
  const fetchInFlight = useMemo(() => ({ current: false }), []);

  // The reset effect fires on:
  //   - A genuine `resetKey` change (filter / query state diverged) —
  //     drop everything and refetch page 1. Once the resetKey has EVER
  //     diverged from the initial value (`hasDivergedRef.current === true`),
  //     subsequent matches against the initial value also refetch —
  //     because the seed is stale by then.
  //   - First render when no SSR seed was provided AND `autoFetchFirstPage`
  //     is `true` — fetch page 1 so the consumer doesn't render empty.
  //     When `autoFetchFirstPage` is `false` (default), stay at the empty
  //     state until the consumer triggers a `loadMore()` (e.g. typeahead
  //     waiting for the user to type the first character).
  //   - First render when a seed WAS provided AND the resetKey hasn't
  //     changed: skip the fetch and use the seed verbatim.
  useEffect(() => {
    const seedAvailable = initial !== undefined && !seedConsumedRef.current;
    const resetKeyMatchesInitial =
      resetKey === initialResetKeyRef.current;

    // Track whether the consumer has ever diverged from the initial
    // resetKey — once they have, any future "match" is a re-visit, not a
    // first-render seed adoption. This is what lets the doctor-picker
    // refetch when the user clears a previously-picked department.
    if (!resetKeyMatchesInitial) {
      hasDivergedRef.current = true;
    }

    const hasDiverged = hasDivergedRef.current;

    if (seedAvailable && resetKeyMatchesInitial && !hasDiverged) {
      // First render with a usable seed — adopt the seed values and mark
      // it consumed so subsequent resetKey changes refetch from scratch.
      seedConsumedRef.current = true;
      setLoaded(initial.data);
      setTotal(initial.total);
      setPage(initial.page);
      setIsLoadingMore(false);
      fetchInFlight.current = false;

      return;
    }

    // No seed AND we're on the initial render (and haven't diverged):
    // skip the fetch unless the caller has explicitly opted into
    // auto-fetch. This lets typeahead pickers (PatientPicker) sit empty
    // until the user types — they pass an empty seed today, but a future
    // caller that omits `initial` entirely shouldn't accidentally fire a
    // wide BE fetch.
    if (
      !seedAvailable &&
      resetKeyMatchesInitial &&
      !hasDiverged &&
      !autoFetchFirstPage
    ) {
      seedConsumedRef.current = true;

      return;
    }

    // Either no seed was provided, or the seed has already been used and
    // resetKey has diverged. Refetch page 1 from scratch.
    //
    // Clear the loaded list synchronously so the consumer doesn't briefly
    // show stale rows from the previous resetKey while the new fetch is in
    // flight — important for filter-cascade pickers (booking wizard
    // doctor → dept) where mixing rows from two filters into one
    // dropdown would be a UX bug.
    seedConsumedRef.current = true;
    setLoaded([]);
    setTotal(0);
    setPage(1);
    setIsLoadingMore(true);
    fetchInFlight.current = true;

    let cancelled = false;

    void loadPage({ page: 1, pageSize })
      .then((response) => {
        if (cancelled) {
          return;
        }

        setLoaded(response.data);
        setTotal(response.total);
        setPage(response.page);
      })
      .catch(() => {
        // Swallow — match `loadMore`'s error policy. The consumer surface
        // stays at its current (empty) page and the user can retry by
        // re-triggering the picker.
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setIsLoadingMore(false);
        fetchInFlight.current = false;
      });

    return () => {
      cancelled = true;
    };
    // `initial` is captured only when the seed is still pending; once the
    // hook has consumed it, identity changes on the prop don't re-trigger
    // a reset. The relevant inputs here are `resetKey`, `pageSize`, and
    // `loadPage`. The caller is expected to memo `loadPage` (it captures
    // filter state, so a new closure on every render is fine — the
    // resetKey is the actual change signal). `autoFetchFirstPage` is
    // intentionally NOT in the deps: the flag is read on the FIRST render
    // only (to gate the no-seed auto-fetch); flipping it mid-life shouldn't
    // re-fire the reset effect on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, pageSize]);

  const hasMore = loaded.length < total;

  const loadMore = useCallback(async () => {
    if (fetchInFlight.current || !hasMore) {
      return;
    }

    fetchInFlight.current = true;
    setIsLoadingMore(true);

    try {
      const nextPage = page + 1;
      const response = await loadPage({ page: nextPage, pageSize });

      setLoaded((prev) => {
        const seen = new Set(prev.map((item) => getKey(item)));
        const additions = response.data.filter(
          (item) => !seen.has(getKey(item)),
        );

        return [...prev, ...additions];
      });
      setPage(nextPage);
      // Refresh total in case the BE row count has shifted between pages
      // (concurrent inserts / deletes). Keeps `hasMore` honest.
      setTotal(response.total);
    } catch {
      // Swallow — the dropdown stays at its current page and the user
      // can keep typing / scrolling. A transient hiccup shouldn't block
      // a modal that's primarily about scheduling, not browsing.
    } finally {
      setIsLoadingMore(false);
      fetchInFlight.current = false;
    }
  }, [fetchInFlight, hasMore, page, pageSize, loadPage, getKey]);

  const reset = useCallback(async () => {
    if (fetchInFlight.current) {
      return;
    }

    fetchInFlight.current = true;
    setIsLoadingMore(true);

    try {
      const response = await loadPage({ page: 1, pageSize });

      setLoaded(response.data);
      setTotal(response.total);
      setPage(response.page);
    } catch {
      // Swallow — same policy as `loadMore`.
    } finally {
      setIsLoadingMore(false);
      fetchInFlight.current = false;
    }
  }, [fetchInFlight, pageSize, loadPage]);

  return { loaded, total, hasMore, isLoadingMore, loadMore, reset };
}
