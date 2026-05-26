"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import ClearableSelect, {
  type ClearableSelectOption,
} from "@/components/shared/select/ClearableSelect";
import { K, NS } from "@/i18n/keys.generated";
import type {
  AppointmentType,
  AppointmentTypeResponse,
} from "@/types/appointment-type.types";

interface AppointmentTypeSelectProps {
  value: AppointmentType | "";
  onChange: (next: AppointmentType | "") => void;
  /**
   * Catalog of available appointment types. Small (currently 4 entries,
   * one per Prisma `AppointmentType` enum member). The caller fetches
   * the full set once (the BE only narrows by department for the F09
   * booking wizard's department-pinned step) and threads it in.
   */
  types: readonly AppointmentTypeResponse[];
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
 * Appointment-type picker. Reads option labels from the
 * `Common.AppointmentType.<code>` i18n catalog so the dropdown stays in
 * sync with the rest of the app (badges on appointment rows, the booking
 * wizard's confirm step, etc.). Caller supplies the field label + the
 * loaded type catalog; the wrapper handles the rest.
 *
 * Format choice: the label reads `<localised name> (<duration> min)` when
 * `showDuration === true`. The " min" suffix is intentionally not i18n'd
 * — the project's MVP doesn't translate unit abbreviations, and matching
 * existing call-site behaviour is what keeps the migration a no-op
 * visual diff.
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

  const options = useMemo<readonly ClearableSelectOption<AppointmentType>[]>(
    () =>
      types.map((type) => ({
        value: type.code,
        label: shouldShowDuration
          ? `${tType(K.Common.AppointmentType[type.code])} (${type.durationMinutes} min)`
          : tType(K.Common.AppointmentType[type.code]),
      })),
    [types, shouldShowDuration, tType],
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
