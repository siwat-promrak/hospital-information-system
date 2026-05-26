"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import ClearableSelect, {
  type ClearableSelectOption,
} from "@/components/shared/select/ClearableSelect";
import { K, NS } from "@/i18n/keys.generated";
import type { DepartmentRow } from "@/types/department.types";

interface DepartmentSelectProps {
  /** Currently-selected department id, or the empty sentinel when none. */
  value: string | "";
  onChange: (next: string | "") => void;
  /**
   * Department catalog. Small (~10 rows for the project), so the caller
   * pre-fetches the full set once at the page level and passes it down
   * — no pagination needed (see CLAUDE.md §5a.1).
   */
  departments: readonly DepartmentRow[];
  /**
   * Required label. Every call site already has a contextual label
   * ("Department" on the form, "Filter by department" on the filter
   * card), so the wrapper does not fabricate a default — keeps the
   * surface free of i18n knowledge and matches the `DoctorSelect`
   * convention.
   */
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
   * Optional accessible label for the × clear button. Defaults to the
   * localised `Common.Select.clearAriaLabel` ("Clear" / "ล้าง") — pass a
   * more contextual string like "Clear department filter" when the
   * surrounding form's i18n catalog has it.
   */
  clearAriaLabel?: string;
}

/**
 * Department picker. Maps each `DepartmentRow` to a
 * `ClearableSelectOption<string>` and forwards every visual prop to
 * `<ClearableSelect>`. The wrapper deliberately does NOT call
 * `useTranslations` for the field label because each call site uses a
 * different contextual label ("Department", "Filter by department",
 * "Department (read-only)"); the caller picks the right key from their
 * own i18n bag and passes it in.
 *
 * Single source of truth for the department options shape — adding a
 * "show inactive" toggle or grouping departments by region tomorrow
 * lands here once, not at every consumer.
 */
export default function DepartmentSelect({
  value,
  onChange,
  departments,
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
}: DepartmentSelectProps) {
  const tSelect = useTranslations(NS.CommonSelect);

  const options = useMemo<readonly ClearableSelectOption<string>[]>(
    () =>
      departments.map((dept) => ({
        value: dept.id,
        label: dept.name,
      })),
    [departments],
  );

  return (
    <ClearableSelect<string>
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
