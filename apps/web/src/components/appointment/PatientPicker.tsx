"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatPatientFullName } from "@/appointment/labels";
import { K, NS } from "@/i18n/keys.generated";
import { searchPatientsAction } from "@/lib/api/patient.actions";
import { PATIENT_PICKER_PAGE_SIZE } from "@/lib/api/patient.const";
import { usePaginatedList } from "@/lib/hooks/use-paginated-list";
import type { PatientResponse } from "@/types/patient.types";

interface PatientPickerProps {
  value: PatientResponse | null;
  onChange: (next: PatientResponse | null) => void;
}

const MIN_SEARCH_CHARS = 2;
const DEBOUNCE_MS = 200;

/**
 * Entity-aware typeahead patient picker used by the F09 booking wizard's
 * step 1. Pair of `<DoctorSelect>` for symmetry — same idea (entity
 * wrapper owns its own action + i18n) with a different UX (inline result
 * list + "Show more" button rather than the dropdown shape).
 *
 * The input is a single text field that fans out to `GET /patients?q=`
 * and renders the first page of hits in a list. The search-by-query
 * state lives in the local `query` ref-and-state pair; a 200ms debounce
 * reduces it to `debouncedQuery`, which the shared `usePaginatedList`
 * hook uses BOTH as the closure-captured filter AND as its `resetKey`.
 * The hook handles cursor + dedup + double-fire guards so this file
 * stays free of the request-sequence counter that previous revisions
 * hand-rolled.
 *
 * A "Show more" button appears below the list when more pages exist
 * beyond what's loaded — without it the user couldn't paginate past
 * page 1.
 *
 * Lives under `components/appointment/` rather than `components/shared/`
 * because the inline-list UX is specific to the booking wizard and the
 * wizard is its only consumer. The matching `<DoctorSelect>` (dropdown
 * shape, reused across pages) lives in `components/shared/` for that
 * reason.
 */
export default function PatientPicker({
  value,
  onChange,
}: PatientPickerProps) {
  const t = useTranslations(NS.BookingWizardPatient);
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");

  const handleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
    },
    [],
  );

  // 200ms debounce — only commits the typed query to `debouncedQuery`
  // (which drives both the closure-captured filter AND the hook's
  // `resetKey`) after the user pauses typing. Reduces fan-out on the
  // BE: typing "siwat" no longer triggers 5 round-trips, just 1.
  //
  // Sub-threshold queries (`< MIN_SEARCH_CHARS`) collapse to the empty
  // string so the hook doesn't refetch on every typed letter while the
  // user is still building the query — `resetKey === ""` stays stable
  // and the seed list (empty) is reused.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = query.trim();

      if (next.length < MIN_SEARCH_CHARS) {
        setDebouncedQuery("");

        return;
      }

      setDebouncedQuery(next);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  const trimmed = debouncedQuery;
  const isSearchable = trimmed.length >= MIN_SEARCH_CHARS;

  // Closure captures `debouncedQuery` so each refetch sends the latest
  // user query. When `debouncedQuery` changes, the `resetKey` below also
  // changes and the hook drops the cursor + refetches page 1.
  //
  // Short-circuit when the query is below the search threshold so a
  // backspace down to empty (e.g. user clears the typeahead after
  // searching) doesn't fire a wide BE fetch for "all patients". The
  // hook still resets `loaded` to `[]` via the synchronous clear in its
  // reset effect, so the UI flips to the empty state immediately — this
  // closure just returns the matching empty envelope without a network
  // round-trip.
  const loadPage = useCallback(
    (args: { page: number; pageSize: number }) => {
      if (trimmed.length < MIN_SEARCH_CHARS) {
        return Promise.resolve({
          data: [],
          total: 0,
          page: args.page,
          pageSize: args.pageSize,
          totalPages: 1,
        });
      }

      return searchPatientsAction({
        q: trimmed,
        page: args.page,
        pageSize: args.pageSize,
      });
    },
    [trimmed],
  );

  // Empty seed satisfies the hook's first-render seed-adoption invariant
  // — the very first render is sub-threshold (`debouncedQuery === ""`), so
  // we hand it `{ data: [] }` and the hook adopts it without firing a
  // request. The `loadPage` short-circuit above handles every subsequent
  // sub-threshold render: when the user backspaces back below threshold
  // the hook drops the loaded list and calls `loadPage`, which returns
  // an immediate empty envelope (no network).
  const initial = useMemo(
    () => ({ data: [] as readonly PatientResponse[], page: 1, total: 0 }),
    [],
  );

  const { loaded, total, hasMore, isLoadingMore, loadMore } =
    usePaginatedList<PatientResponse>({
      loadPage,
      initial,
      getKey: (p) => p.id,
      resetKey: trimmed,
      pageSize: PATIENT_PICKER_PAGE_SIZE,
    });

  // Guard rendering of results + load-more on the search-threshold check
  // — even though the hook may have stale rows from a previous search,
  // visually we want sub-threshold to mean "no results yet, type more".
  const results = isSearchable ? loaded : [];
  const showEmptyHint = !isSearchable;
  const showNoResults =
    isSearchable && !isLoadingMore && results.length === 0;
  const showLoadMore = isSearchable && hasMore && !isLoadingMore;

  return (
    <Stack spacing={2}>
      <TextField
        label={t(K.BookingWizard.Patient.searchLabel)}
        placeholder={t(K.BookingWizard.Patient.searchPlaceholder)}
        helperText={t(K.BookingWizard.Patient.searchHelper)}
        value={query}
        onChange={handleQueryChange}
        fullWidth
      />

      {value ? (
        <Box
          sx={{
            border: 1,
            borderColor: "primary.light",
            borderRadius: 1,
            bgcolor: "primary.50",
            p: 2,
          }}
        >
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            justifyContent="space-between"
          >
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{ minWidth: 0 }}
            >
              <CheckCircleIcon color="primary" />
              <Stack spacing={0} sx={{ minWidth: 0 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                >
                  {t(K.BookingWizard.Patient.selected)}
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight={600}
                  noWrap
                >
                  {formatPatientFullName(value)}
                </Typography>
              </Stack>
            </Stack>
            <Chip
              label={`HN ${value.hn}`}
              color="primary"
              size="small"
            />
          </Stack>
        </Box>
      ) : null}

      {isLoadingMore && results.length === 0 ? (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            py: 2,
          }}
        >
          <CircularProgress size={20} />
        </Box>
      ) : null}

      {showEmptyHint && !value ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ pl: 1 }}
        >
          {t(K.BookingWizard.Patient.noResultsEmpty)}
        </Typography>
      ) : null}

      {showNoResults ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ pl: 1 }}
        >
          {t(K.BookingWizard.Patient.noResults, { query: trimmed })}
        </Typography>
      ) : null}

      {results.length > 0 ? (
        <Stack spacing={1}>
          <List
            dense
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              maxHeight: 320,
              overflowY: "auto",
              py: 0,
            }}
          >
            {results.map((p) => {
              const selected = value?.id === p.id;

              return (
                <ListItemButton
                  key={p.id}
                  selected={selected}
                  onClick={() => onChange(p)}
                >
                  <ListItemText
                    // MUI defaults `primary` to a `<Typography component="p">`
                    // and `secondary` to a `<Typography component="p">` —
                    // wrapping a `<Stack>` (renders `<div>`) inside a `<p>`
                    // is invalid HTML and trips React 19 strict hydration.
                    // Override both slots to `component="div"` so the flex
                    // rows are valid block-level children.
                    slotProps={{
                      primary: { component: "div" },
                      secondary: { component: "div" },
                    }}
                    primary={
                      <Stack
                        direction="row"
                        spacing={1.5}
                        alignItems="baseline"
                        flexWrap="wrap"
                      >
                        <Typography variant="body1" fontWeight={500}>
                          {formatPatientFullName(p)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          HN {p.hn}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <Stack
                        direction="row"
                        spacing={2}
                        sx={{ color: "text.secondary" }}
                      >
                        <Typography
                          variant="caption"
                          component="span"
                        >
                          {p.phone}
                        </Typography>
                        <Typography
                          variant="caption"
                          component="span"
                        >
                          {p.identificationNo}
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItemButton>
              );
            })}
          </List>

          {/* Footer row: pagination affordance + result counter. The
              "Show more" button only renders when the BE has more rows
              than the loaded list shows. While a load is in flight the
              button hides and a spinner row sits in its place — a
              clearer signal than disabling the button. */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 1 }}
          >
            <Typography variant="caption" color="text.secondary">
              {t(K.BookingWizard.Patient.showingCount, {
                loaded: results.length,
                total,
              })}
            </Typography>
            {showLoadMore ? (
              <Button
                type="button"
                variant="text"
                size="small"
                onClick={() => {
                  void loadMore();
                }}
              >
                {t(K.BookingWizard.Patient.loadMore)}
              </Button>
            ) : null}
            {isLoadingMore ? <CircularProgress size={16} /> : null}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}
