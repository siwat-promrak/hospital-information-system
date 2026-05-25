"use client";

import Autocomplete, {
  type AutocompleteRenderInputParams,
} from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Paper, { type PaperProps } from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { forwardRef, useCallback, useMemo } from "react";
import type { ReactNode, UIEvent } from "react";

interface SearchableSelectProps<T> {
  /**
   * Currently-selected option, or `null` when no selection. The caller
   * owns the form state; this component is uncontrolled-by-search but
   * controlled-by-value.
   */
  value: T | null;
  /** Fired on selection change with the new value (or `null` on clear). */
  onChange: (value: T | null) => void;
  /** Full set of options the user can pick from. Filtering is client-side. */
  options: readonly T[];
  /** Returns the user-visible label string for an option. */
  getOptionLabel: (option: T) => string;
  /**
   * Returns a stable id for an option — used as the React `key` for each
   * row AND as the `isOptionEqualToValue` discriminator so a re-fetch of
   * `options` (e.g. after a parent refresh) doesn't drop the selection.
   */
  getOptionKey: (option: T) => string;
  /**
   * Optional custom row renderer for richer dropdown rows (e.g. a name
   * + subtitle). Defaults to a single-line label when omitted.
   */
  renderOption?: (option: T) => ReactNode;
  /** Field label shown inside the text input. Caller-supplied for i18n. */
  label?: string;
  /** Placeholder text shown when no option is selected. */
  placeholder?: string;
  /** When `true`, the input is read-only and not focusable. */
  disabled?: boolean;
  /** Highlights the input border + helper text in error colour. */
  error?: boolean;
  /** Helper text under the input — pairs with `error` for validation. */
  helperText?: string;
  /** Marks the underlying `<input>` as required for native form semantics. */
  required?: boolean;
  /**
   * Copy shown inside the dropdown when no options match the typed query.
   * Defaults to `"No matches"` — caller can override for i18n.
   */
  noOptionsText?: string;
  /**
   * Async loader called when the user scrolls within `LOAD_MORE_THRESHOLD`
   * pixels of the listbox bottom AND `hasMore === true` AND
   * `isLoading === false`. The caller owns the page cursor — this
   * component only signals "fetch more now".
   */
  loadMore?: () => void;
  /**
   * `true` while a `loadMore()` fetch is in flight. Renders an inline
   * spinner row inside the listbox so the user gets feedback without the
   * dropdown collapsing.
   */
  isLoading?: boolean;
  /**
   * `true` when more pages exist beyond what's currently in `options`.
   * When `false`, the scroll listener stops calling `loadMore()` and the
   * footer hint hides.
   */
  hasMore?: boolean;
  /**
   * Footer hint shown inside the dropdown while `hasMore === true` and no
   * fetch is in flight. Typically reads "Showing X of Y — scroll to load
   * more". Caller-supplied for i18n.
   */
  hasMoreLabel?: string;
  /** Loading-row copy. Defaults to caller string when omitted. */
  loadingMoreLabel?: string;
  /**
   * Scoped-search hint shown ABOVE the option list while `hasMore === true`.
   * Calls out that the substring filter only matches rows already loaded,
   * so the user knows to scroll if they don't see what they expect. This
   * is the Path-B workaround for the missing BE `?q=` param — once the BE
   * supports server-side search this hint can be removed.
   */
  searchScopedHint?: string;
}

/**
 * Pixel distance from the bottom of the listbox at which we trigger the
 * next-page fetch. Tuned to fire BEFORE the user hits the end so the
 * spinner has a chance to render and the next page arrives before they
 * notice a stall.
 */
const LOAD_MORE_THRESHOLD = 200;

/**
 * Custom props the `PaginatedPaper` slot reads off its own `props` to
 * decide whether to render the header hint, the loading row, and the
 * footer "X of Y" hint. They piggy-back on the MUI `slotProps.paper`
 * API: anything passed there is merged into the rendered Paper's props
 * by MUI's Autocomplete. We keep these on the Paper's props (rather
 * than in the factory's closure) so the component identity stays
 * stable across renders — only its props change when, say, `isLoading`
 * flips during a `loadMore` cycle. That stability is what prevents
 * MUI from unmounting + remounting the popper paper (and with it, the
 * listbox), which would reset `scrollTop` to 0 and break infinite
 * scroll. Marked optional because non-paginated callers don't supply
 * them.
 */
interface PaginatedPaperExtraProps {
  searchScopedHint?: string;
  hasMoreLabel?: string;
  loadingMoreLabel?: string;
  showSearchScopedHint?: boolean;
  showLoadingRow?: boolean;
  showHasMoreFooter?: boolean;
}

type PaginatedPaperProps = PaperProps & PaginatedPaperExtraProps;

/**
 * Paper slot for MUI `Autocomplete` that wraps the default popper paper
 * with an optional header (search-scoped hint) and footer (loading
 * spinner + "X of Y" hint). The MUI `slots.paper` API receives the
 * listbox as `children`, so we render that verbatim and append our own
 * rows around it.
 *
 * **Stability rule (load-bearing):** This component is declared at the
 * module scope so its reference identity is constant for the lifetime
 * of the bundle. The volatile flags (`showLoadingRow`,
 * `showHasMoreFooter`, …) arrive as **props**, not as closure
 * captures. That's deliberate — if these flags lived inside a closure
 * (i.e. inside a factory called from `useMemo`), every change to the
 * flag would produce a new component reference and MUI would unmount
 * the popper paper + listbox on the next render. The listbox losing
 * its DOM node means `scrollTop` resets to 0, which is the exact
 * scroll-jump bug the doctor picker had to begin with.
 */
const PaginatedPaper = forwardRef<HTMLDivElement, PaginatedPaperProps>(
  function PaginatedPaperInner(props, ref) {
    const {
      children,
      searchScopedHint,
      hasMoreLabel,
      loadingMoreLabel,
      showSearchScopedHint,
      showLoadingRow,
      showHasMoreFooter,
      ...rest
    } = props;

    return (
      <Paper {...rest} ref={ref}>
        {showSearchScopedHint && searchScopedHint ? (
          <Box
            sx={{
              px: 2,
              py: 1,
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: "background.default",
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {searchScopedHint}
            </Typography>
          </Box>
        ) : null}
        {children}
        {showLoadingRow ? (
          <Box
            role="status"
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              py: 1,
              borderTop: 1,
              borderColor: "divider",
            }}
          >
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">
              {loadingMoreLabel}
            </Typography>
          </Box>
        ) : null}
        {showHasMoreFooter && hasMoreLabel ? (
          <Box
            sx={{
              px: 2,
              py: 0.75,
              borderTop: 1,
              borderColor: "divider",
              textAlign: "center",
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {hasMoreLabel}
            </Typography>
          </Box>
        ) : null}
      </Paper>
    );
  },
);

/**
 * Shared searchable picker built on MUI `<Autocomplete>`. Generic over the
 * option shape so every consumer specifies its own row type plus the
 * `getOptionLabel` / `getOptionKey` (and optional `renderOption`)
 * extractors. The caller owns the data — there is no fetch logic here so
 * the shared component stays free of API knowledge per CLAUDE.md rule 5a.
 *
 * Behaviour:
 *  - Search-as-you-type filtering on the option label (client-side).
 *  - Single-select. The selected option is mirrored back through `value`
 *    so the caller can drive it from form state.
 *  - `isOptionEqualToValue` runs through `getOptionKey` so a refetch that
 *    produces a new object reference for the same id keeps the selection.
 *  - Infinite scroll: when the caller passes `loadMore` + `hasMore`, the
 *    listbox triggers a fetch as the user nears the bottom. The component
 *    renders a footer hint + spinner row so the loading state is
 *    discoverable without leaving the dropdown.
 *
 * Search-completeness caveat: the substring filter runs ONLY over the
 * options already passed in via `options`. With paginated loading, that
 * means a row on page 5 won't surface in search until the user has
 * scrolled far enough to fetch it. A future BE `?q=` parameter on the
 * underlying list endpoint is the proper fix — once that lands, the
 * `searchScopedHint` prop should be retired and the parent should drive
 * search via a debounced fetch instead of relying on the client filter.
 *
 * Performance: at current project scale (~15 doctors today, designed for
 * a few hundred) the default MUI listbox renders every matched row in the
 * DOM. The dropdown caps its visible height so the user scrolls within
 * it rather than the page. When the option set grows past ~1000 rows we
 * can swap in a virtualised `ListboxComponent` here without changing the
 * call sites.
 */
export default function SearchableSelect<T>({
  value,
  onChange,
  options,
  getOptionLabel,
  getOptionKey,
  renderOption,
  label,
  placeholder,
  disabled,
  error,
  helperText,
  required,
  noOptionsText,
  loadMore,
  isLoading,
  hasMore,
  hasMoreLabel,
  loadingMoreLabel,
  searchScopedHint,
}: SearchableSelectProps<T>) {
  // Re-shape `options` as a mutable array because MUI typings reject
  // `readonly T[]` directly — the component itself never mutates the
  // array, only enumerates it.
  const optionList = options as T[];

  const renderTextInput = useCallback(
    (params: AutocompleteRenderInputParams) => (
      <TextField
        {...params}
        label={label}
        placeholder={placeholder}
        error={error}
        helperText={helperText}
        required={required}
      />
    ),
    [label, placeholder, error, helperText, required],
  );

  /**
   * Listbox scroll handler — fires the next-page fetch when the user
   * approaches the bottom of the dropdown. Guards against re-firing while
   * a fetch is already in flight (`isLoading`) and stops once `hasMore`
   * goes `false`. Only attached when the caller provides `loadMore`, so
   * non-paginated consumers (the existing department picker etc.) pay
   * zero overhead. Wrapped in `useCallback` so the listbox's `onScroll`
   * prop keeps a stable reference between renders — MUI's listbox stays
   * mounted across `setState` updates and `scrollTop` is preserved.
   */
  const handleListboxScroll = useCallback(
    (event: UIEvent<HTMLUListElement>) => {
      if (!loadMore || !hasMore || isLoading) {
        return;
      }

      const target = event.currentTarget;
      const remaining =
        target.scrollHeight - target.scrollTop - target.clientHeight;

      if (remaining < LOAD_MORE_THRESHOLD) {
        loadMore();
      }
    },
    [loadMore, hasMore, isLoading],
  );

  const showInfiniteScroll = Boolean(loadMore);
  const showSearchScopedHint =
    showInfiniteScroll && Boolean(hasMore) && Boolean(searchScopedHint);
  const showLoadingRow = showInfiniteScroll && Boolean(isLoading);
  const showHasMoreFooter =
    showInfiniteScroll && Boolean(hasMore) && !isLoading && Boolean(hasMoreLabel);

  // `slots.paper` is a stable component reference (declared at the module
  // scope above) so MUI never sees a new Paper type across renders. The
  // volatile state moves into `slotProps.paper` below — MUI merges those
  // into the rendered Paper's props, which is a render-only update that
  // keeps the popper + listbox DOM intact and preserves `scrollTop`
  // during a `loadMore` cycle.
  const paperSlots = useMemo(
    () => (showInfiniteScroll ? { paper: PaginatedPaper } : undefined),
    [showInfiniteScroll],
  );

  // The Paper slot's volatile props. MUI passes anything in `slotProps.paper`
  // through to the rendered Paper, so the loading/footer/hint flags ride
  // here instead of being baked into a fresh component factory.
  const paperSlotProps = useMemo<PaginatedPaperExtraProps | undefined>(
    () =>
      showInfiniteScroll
        ? {
            searchScopedHint,
            hasMoreLabel,
            loadingMoreLabel,
            showSearchScopedHint,
            showLoadingRow,
            showHasMoreFooter,
          }
        : undefined,
    [
      showInfiniteScroll,
      searchScopedHint,
      hasMoreLabel,
      loadingMoreLabel,
      showSearchScopedHint,
      showLoadingRow,
      showHasMoreFooter,
    ],
  );

  // Listbox slotProps memoised so the `onScroll` + `sx` object identity
  // stays stable across renders — a fresh object literal on every render
  // would otherwise re-trigger MUI's slot reconciliation.
  const listboxSlotProps = useMemo(
    () => ({
      onScroll: showInfiniteScroll ? handleListboxScroll : undefined,
      sx: { maxHeight: 320 },
    }),
    [showInfiniteScroll, handleListboxScroll],
  );

  // `renderOption` from the caller is per-render — wrap it so the callback
  // identity is stable when the caller's reference is stable. The
  // `_ignored` key destructure is preserved from before: MUI auto-injects
  // a `key` on the `<li>` props and we override it with our own derived
  // from `getOptionKey` to keep list-row identity stable across refreshes.
  const renderOptionRow = useCallback(
    (
      props: React.HTMLAttributes<HTMLLIElement>,
      option: T,
    ): ReactNode => {
      if (!renderOption) {
        return null;
      }

      const { key: _ignored, ...liProps } = props as typeof props & {
        key?: unknown;
      };

      return (
        <li {...liProps} key={getOptionKey(option)}>
          {renderOption(option)}
        </li>
      );
    },
    [renderOption, getOptionKey],
  );
  const renderOptionInternal = renderOption ? renderOptionRow : undefined;

  const isOptionEqualToValue = useCallback(
    (option: T, candidate: T) => getOptionKey(option) === getOptionKey(candidate),
    [getOptionKey],
  );

  const handleAutocompleteChange = useCallback(
    (_event: unknown, next: T | null) => {
      onChange(next);
    },
    [onChange],
  );

  return (
    <Autocomplete
      options={optionList}
      value={value}
      onChange={handleAutocompleteChange}
      getOptionLabel={getOptionLabel}
      isOptionEqualToValue={isOptionEqualToValue}
      renderOption={renderOptionInternal}
      disabled={disabled}
      noOptionsText={noOptionsText ?? "No matches"}
      slots={paperSlots}
      slotProps={{
        paper: paperSlotProps,
        listbox: listboxSlotProps,
      }}
      renderInput={renderTextInput}
    />
  );
}
