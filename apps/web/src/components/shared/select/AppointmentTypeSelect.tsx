"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import ClearableSelect, {
  type ClearableSelectOption,
} from "@/components/shared/select/ClearableSelect";
import { K, NS } from "@/i18n/keys.generated";
import {
  MIDNIGHT_MINUTES,
  MINUTES_PER_DAY,
} from "@/lib/api/clinic.const";
import { dayjs } from "@/lib/dayjs";
import type { AppointmentType } from "@/types/appointment-type.types";
import type { DepartmentAppointmentTypeRow } from "@/types/department.types";

interface AppointmentTypeSelectProps {
  value: AppointmentType | "";
  onChange: (next: AppointmentType | "") => void;
  /**
   * Catalog of available appointment types for the picked department —
   * each row carries the department-specific `durationMinutes` plus the
   * optional booking-window minute-of-day bounds. The booking wizard
   * fetches this via `getDepartmentAppointmentTypes(departmentId)` once
   * a department is picked (F13).
   *
   * Before F13 this prop was the global label catalog
   * `AppointmentTypeResponse[]`; the global endpoint no longer carries
   * `durationMinutes`, so the consumer must thread the per-department
   * rows through instead.
   */
  types: readonly DepartmentAppointmentTypeRow[];
  label: string;
  clearable?: boolean;
  size?: "small" | "medium";
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  fullWidth?: boolean;
  placeholder?: string;
  /**
   * Optional accessible label for the × clear button. Defaults to
   * `Common.Select.clearAriaLabel`.
   */
  clearAriaLabel?: string;
  /**
   * Whether to append the type's `durationMinutes` to the dropdown label
   * (e.g. `"Procedure (45 min)"`). Defaults to `true` — the booking
   * wizard's slot step relies on the duration cue to help the user pick
   * a slot length. Set to `false` when the surrounding context (e.g. a
   * future filter card) only needs the type label.
   */
  showDuration?: boolean;
}

/**
 * Convert a wall-clock minute-of-day (local in the clinic's timezone, as
 * carried verbatim on the BE wire) to its `HH:mm` representation. Uses
 * dayjs per CLAUDE.md rule 9 — no manual `Math.floor / 60` / `% 60`
 * arithmetic. We anchor at `startOf('day')` and add the minute offset;
 * because the BE already converted UTC to local minute-of-day, no
 * timezone math runs here.
 */
function formatMinuteOfDay(minute: number): string {
  return dayjs().startOf("day").add(minute, "minute").format("HH:mm");
}

/**
 * Render the booking-window suffix for a department-scoped appointment
 * type. Returns `null` when the row has zero booking-window ranges (the
 * type is bookable any time the doctor works).
 *
 * Per-range copy — keyed off the day-edge anchoring of each range:
 *
 *  - `[MIDNIGHT, end)`  → `"Before 11:00 only"` (afternoon-restricted)
 *  - `[start, EOD)`     → `"From 13:00"`        (morning-restricted)
 *  - `[start, end)`     → `"09:00 – 12:00"`     (interior range)
 *
 * Where the row carries multiple ranges, each is formatted via the same
 * per-range rule above and joined with the locale's "or" connector —
 * e.g. `"09:00 – 11:00 or 14:00 – 16:00"` (two interior ranges) or
 * `"Before 11:00 only or From 15:00"` (day-edge split).
 */
function useWindowSuffix(): (
  row: DepartmentAppointmentTypeRow,
) => string | null {
  const tWindow = useTranslations(NS.CommonAppointmentTypeWindow);

  return (row) => {
    if (row.bookingWindows.length === 0) {
      return null;
    }

    const joiner = tWindow(K.Common.AppointmentTypeWindow.multiRangeJoin);

    const parts = row.bookingWindows.map((window) => {
      const isAnchoredAtMidnight = window.startMinute === MIDNIGHT_MINUTES;
      const isAnchoredAtEndOfDay = window.endMinute === MINUTES_PER_DAY;

      if (isAnchoredAtMidnight && !isAnchoredAtEndOfDay) {
        return tWindow(K.Common.AppointmentTypeWindow.beforeOnly, {
          end: formatMinuteOfDay(window.endMinute),
        });
      }

      if (isAnchoredAtEndOfDay && !isAnchoredAtMidnight) {
        return tWindow(K.Common.AppointmentTypeWindow.fromOnly, {
          start: formatMinuteOfDay(window.startMinute),
        });
      }

      return tWindow(K.Common.AppointmentTypeWindow.range, {
        start: formatMinuteOfDay(window.startMinute),
        end: formatMinuteOfDay(window.endMinute),
      });
    });

    return parts.join(joiner);
  };
}

/**
 * Appointment-type picker. Reads option labels from the
 * `Common.AppointmentType.<code>` i18n catalog so the dropdown stays in
 * sync with the rest of the app (badges on appointment rows, the booking
 * wizard's confirm step, etc.). Caller supplies the field label + the
 * loaded per-department type catalog (F13); the wrapper handles the rest.
 *
 * Format choice: the dropdown reads
 * `<localised name> · <duration> min[ · <window>]` so the duration cue
 * and the booking-window restriction both surface in the chip the user
 * picks from. The " min" suffix is intentionally not i18n'd — the
 * project's MVP doesn't translate unit abbreviations, and matching
 * existing call-site behaviour keeps the migration a no-op visual diff.
 *
 * The window copy comes from `Common.AppointmentTypeWindow.*` so the
 * three variants (range / before-only / from-only) translate as a unit.
 */
export default function AppointmentTypeSelect({
  value,
  onChange,
  types,
  label,
  clearable,
  size,
  required,
  disabled,
  error,
  helperText,
  fullWidth,
  placeholder,
  clearAriaLabel,
  showDuration,
}: AppointmentTypeSelectProps) {
  const tType = useTranslations(NS.CommonAppointmentType);
  const tSelect = useTranslations(NS.CommonSelect);
  const shouldShowDuration = showDuration !== false;
  const formatWindow = useWindowSuffix();

  const options = useMemo<readonly ClearableSelectOption<AppointmentType>[]>(
    () =>
      types.map((type) => {
        const typeName = tType(K.Common.AppointmentType[type.code]);
        const segments: string[] = [typeName];

        if (shouldShowDuration) {
          segments.push(`${type.durationMinutes} min`);
        }

        const window = formatWindow(type);

        if (window) {
          segments.push(window);
        }

        return {
          value: type.code,
          label: segments.join(" · "),
        };
      }),
    [types, shouldShowDuration, tType, formatWindow],
  );

  return (
    <ClearableSelect<AppointmentType>
      value={value}
      onChange={onChange}
      options={options}
      label={label}
      clearable={clearable}
      clearAriaLabel={
        clearAriaLabel ?? tSelect(K.Common.Select.clearAriaLabel)
      }
      size={size}
      required={required}
      disabled={disabled}
      error={error}
      helperText={helperText}
      placeholder={placeholder}
      fullWidth={fullWidth}
    />
  );
}
