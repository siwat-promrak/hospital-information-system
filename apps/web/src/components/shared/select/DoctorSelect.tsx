"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import EntityPicker from "@/components/shared/select/EntityPicker";
import { K, NS } from "@/i18n/keys.generated";
import { loadDoctorsPageAction } from "@/lib/api/doctor.actions";
import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import type { DoctorListRow } from "@/types/doctor.types";

interface DoctorSelectProps {
  /** Currently-selected doctor row, or `null` when no selection. */
  value: DoctorListRow | null;
  /** Fired on selection change with the new doctor (or `null` on clear). */
  onChange: (next: DoctorListRow | null) => void;
  /**
   * Optional filter — restrict the picker to one department. When this
   * changes, the picker drops its cursor + loaded list and refetches
   * page 1. Pass `undefined` for "all departments" (MRO surfaces).
   */
  departmentId?: string;
  /**
   * Optional SSR seed for page 1. Provided by pages that want the picker
   * pre-populated on first paint (no spinner flash). When omitted, the
   * component fetches page 1 on mount via the server action — useful for
   * picker call sites opened in a modal or below the fold where SSR
   * doesn't help.
   */
  initial?: PaginatedListInitial<DoctorListRow>;
  /** Optional caller-supplied label (defaults to `Common.DoctorPicker.label`). */
  label?: string;
  /** Optional placeholder (defaults to `Common.DoctorPicker.placeholder`). */
  placeholder?: string;
  size?: "small" | "medium";
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  clearable?: boolean;
}

/**
 * Entity-aware doctor picker. Wraps the generic `<EntityPicker>` and owns
 * all doctor-specific plumbing: the page loader closure, the reset key,
 * the option label / key extractors, the rich two-line row renderer, and
 * the i18n bag. Consumers pass `value` / `onChange` plus an optional
 * `departmentId` filter and the picker handles every detail in between.
 *
 * Conventions consumers reach for:
 *   - Page-level call sites (filter cards, form pages that have a server
 *     component above them) pass an `initial` seed produced by
 *     `fetchDoctorPickerSeed({ departmentId })` so first paint is
 *     populated without a spinner flash.
 *   - Modal / below-the-fold call sites omit `initial`; the picker fires
 *     page 1 on mount via `loadDoctorsPageAction` (the `autoFetchFirstPage`
 *     opt-in on `usePaginatedList` makes this safe).
 *
 * Search-completeness caveat: the substring filter inside the underlying
 * `SearchableSelect` runs ONLY over rows already loaded. The BE doesn't
 * yet accept `?q=` on `/doctors`, so the `searchScopedHint` slot surfaces
 * the caveat; swap to a debounced server-driven search when the BE adds
 * `?q=`. Mirrored in `Common.DoctorPicker.searchScopedHint`.
 */
export default function DoctorSelect({
  value,
  onChange,
  departmentId,
  initial,
  label,
  placeholder,
  size,
  required,
  disabled,
  error,
  helperText,
  clearable,
}: DoctorSelectProps) {
  const t = useTranslations(NS.CommonDoctorPicker);

  const loadPage = useCallback(
    (args: { page: number; pageSize: number }) =>
      loadDoctorsPageAction({
        page: args.page,
        pageSize: args.pageSize,
        departmentId,
      }),
    [departmentId],
  );

  // Deterministic reset signal — bumping `departmentId` drops the cursor
  // and refetches page 1 via the new closure. Empty string matches "all
  // departments".
  const resetKey = departmentId ?? "";

  return (
    <EntityPicker<DoctorListRow>
      initial={initial}
      loadPage={loadPage}
      resetKey={resetKey}
      value={value}
      onChange={onChange}
      getOptionLabel={(option) =>
        `${option.fullName} (${option.doctorCode})`
      }
      getOptionKey={(option) => option.id}
      renderOption={(option) => (
        <Box sx={{ display: "flex", flexDirection: "column", py: 0.25 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {option.fullName}{" "}
            <Box
              component="span"
              sx={{ color: "text.secondary", fontWeight: 400 }}
            >
              ({option.doctorCode})
            </Box>
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ whiteSpace: "normal" }}
          >
            {option.department.name}
          </Typography>
        </Box>
      )}
      label={label ?? t(K.Common.DoctorPicker.label)}
      placeholder={placeholder ?? t(K.Common.DoctorPicker.placeholder)}
      size={size}
      required={required}
      disabled={disabled}
      error={error}
      helperText={helperText}
      clearable={clearable}
      autoFetchFirstPage={initial === undefined}
      i18n={{
        loadingMore: t(K.Common.DoctorPicker.loadingMore),
        showingCount: (loaded, total) =>
          t(K.Common.DoctorPicker.showingCount, { loaded, total }),
        searchScopedHint: t(K.Common.DoctorPicker.searchScopedHint),
        noMatches: t(K.Common.DoctorPicker.noMatches),
      }}
    />
  );
}
