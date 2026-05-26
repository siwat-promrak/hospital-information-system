"use client";

import type { ReactNode } from "react";

import SearchableSelect from "@/components/shared/select/SearchableSelect";
import {
  usePaginatedList,
  type PaginatedListInitial,
} from "@/lib/hooks/use-paginated-list";
import type { Paginated } from "@/types/pagination.types";

/**
 * Caller-provided localised strings for the picker's loading / footer /
 * search-scoped / no-match copy. The component never calls `useTranslations`
 * itself so it can stay free of entity-specific i18n — each consumer builds
 * these strings via its own namespace (`tSlot(K.BookingWizard.Slot.*)`,
 * `tForm(K.Schedules.Form.*)`, …) before passing them in.
 *
 * `showingCount` is a function (not a pre-built string) because the
 * `loaded` count lives inside `usePaginatedList` and grows as pages
 * stream in. The picker calls it on every render with the latest
 * counts so the footer hint updates without the consumer having to
 * track the loaded list locally.
 */
export interface EntityPickerI18n {
  /** Inline spinner row copy — "Loading more…". */
  loadingMore: string;
  /**
   * Footer hint factory — called with the live `loaded` / `total` counts
   * straight from the hook so the caller can plug them into a
   * next-intl ICU template, e.g.
   * `(loaded, total) => tSlot(K.X.showingCount, { loaded, total })`.
   */
  showingCount: (loaded: number, total: number) => string;
  /** Header hint shown above the option list while `hasMore === true`. */
  searchScopedHint: string;
  /** Empty-state copy inside the dropdown when no options match the query. */
  noMatches: string;
}

export interface EntityPickerProps<T> {
  /** Optional SSR seed for page 1. Forwarded verbatim to `usePaginatedList`. */
  initial?: PaginatedListInitial<T>;
  /**
   * Closure-based page loader the picker calls on scroll-load-more. The
   * caller captures any filter / query state inside this closure so the
   * picker never knows about domain filters.
   */
  loadPage: (args: { page: number; pageSize: number }) => Promise<Paginated<T>>;
  /**
   * Deterministic string derived from the caller's filter / query state.
   * When this changes the hook drops the cursor and refetches page 1 via
   * `loadPage` — typically composed via a template literal like
   * `` `${departmentId ?? ""}|${q ?? ""}` ``.
   */
  resetKey: string;
  /** Page size threaded through every `loadPage` call. Defaults to 20. */
  pageSize?: number;
  /**
   * Forwarded to `usePaginatedList` — when `true` AND no `initial` seed
   * was provided, the picker fires page 1 on mount via `loadPage` so the
   * dropdown is populated when the user opens it. Entity wrappers
   * (`<DoctorSelect>`) set this based on whether the caller passed a seed
   * so picker call sites opened in modals don't render an empty dropdown.
   * Defaults to `false` to preserve the previous "seed or nothing" contract.
   */
  autoFetchFirstPage?: boolean;

  // Selection
  /** Currently-selected option, or `null` when no selection. */
  value: T | null;
  /** Fired on selection change with the new value (or `null` on clear). */
  onChange: (next: T | null) => void;
  /** Returns the user-visible label string for an option. */
  getOptionLabel: (item: T) => string;
  /** Returns a stable id used for keys + value equality across refetches. */
  getOptionKey: (item: T) => string;
  /** Optional custom row renderer for richer dropdown rows. */
  renderOption?: (item: T) => ReactNode;

  // Visual (forwarded to SearchableSelect)
  label?: string;
  placeholder?: string;
  size?: "small" | "medium";
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  /** Show the "×" clear affordance inside the picker. */
  clearable?: boolean;

  /** Caller-provided localised strings — see `EntityPickerI18n`. */
  i18n: EntityPickerI18n;
}

/**
 * Generic paginated picker — thin glue between `usePaginatedList` (state
 * machine) and `<SearchableSelect>` (rendering primitive). Every paginated
 * entity (doctors today, nurses / pharmacies tomorrow) drops into this
 * picker without a new entity-specific hook.
 *
 * The component owns no domain knowledge: the `loadPage` closure carries
 * the filter / query state the caller wants, `resetKey` signals when to
 * re-fetch from page 1, and the `i18n` bag carries all user-visible copy.
 * Consumers stay responsible for their own option-label / row-renderer +
 * `tNamespace(K.X.Y, { loaded, total })` interpolation.
 *
 * Call-site convention: consumers should reach for the entity wrapper
 * (`<DoctorSelect>`, `<PatientPicker>`, future `<NurseSelect>` /
 * `<PharmacySelect>`) instead of `<EntityPicker>` directly. The wrappers
 * own the per-entity `loadPage` / `resetKey` / `i18n` so pages don't
 * reassemble that plumbing at every call site. `<EntityPicker>` stays
 * exported as the building block the wrappers compose with — calling it
 * directly from a page or feature module is a code smell.
 */
export default function EntityPicker<T>({
  initial,
  loadPage,
  resetKey,
  pageSize,
  autoFetchFirstPage,
  value,
  onChange,
  getOptionLabel,
  getOptionKey,
  renderOption,
  label,
  placeholder,
  size,
  required,
  disabled,
  error,
  helperText,
  clearable,
  i18n,
}: EntityPickerProps<T>) {
  const { loaded, total, hasMore, isLoadingMore, loadMore } =
    usePaginatedList<T>({
      loadPage,
      initial,
      getKey: getOptionKey,
      resetKey,
      pageSize,
      autoFetchFirstPage,
    });

  return (
    <SearchableSelect<T>
      value={value}
      onChange={onChange}
      options={loaded}
      getOptionLabel={getOptionLabel}
      getOptionKey={getOptionKey}
      renderOption={renderOption}
      label={label}
      placeholder={placeholder}
      size={size}
      required={required}
      disabled={disabled}
      error={error}
      helperText={helperText}
      clearable={clearable}
      noOptionsText={i18n.noMatches}
      loadMore={loadMore}
      isLoading={isLoadingMore}
      hasMore={hasMore}
      hasMoreLabel={i18n.showingCount(loaded.length, total)}
      loadingMoreLabel={i18n.loadingMore}
      searchScopedHint={i18n.searchScopedHint}
    />
  );
}
