"use client";

import { useMemo } from "react";

import ClearableSelect, {
  type ClearableSelectOption,
} from "@/components/shared/select/ClearableSelect";
import {
  APPOINTMENT_LIST_ORDER,
  type AppointmentListOrderValue,
} from "@/lib/api/appointment.const";

interface OrderSelectProps {
  value: AppointmentListOrderValue;
  /**
   * Fires on every change. The picker is NOT clearable — asc/desc is
   * always one of the two — so the callback narrows to the non-empty
   * union (no `""` sentinel).
   */
  onChange: (next: AppointmentListOrderValue) => void;
  /**
   * User-visible "ascending" label. Caller-supplied because each filter
   * card uses its own copy — appointments today reads "Earliest first /
   * Latest first", but a future visit-log filter might want "Oldest /
   * Newest". Keeping the labels at the call site lets the wrapper stay
   * generic.
   */
  ascLabel: string;
  descLabel: string;
  label: string;
  size?: "small" | "medium";
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

/**
 * Asc/desc sort-direction picker. Composes `<ClearableSelect>` without
 * the `clearable` flag — the field has no "no value" state, so the ×
 * button never makes sense here. Adapter shape: takes the `value` and
 * widens it back to `V | ""` for the primitive (which always carries
 * the empty-string sentinel internally), then narrows the
 * `onChange(V | "")` signal back to `V`.
 *
 * The narrowing is safe because the picker never offers `""` as an
 * option — the dropdown only contains `ASC` + `DESC`. Without this
 * adapter the caller would have to handle the impossible empty case
 * just to satisfy the primitive's signature.
 */
export default function OrderSelect({
  value,
  onChange,
  ascLabel,
  descLabel,
  label,
  size,
  required,
  disabled,
  fullWidth,
}: OrderSelectProps) {
  const options = useMemo<
    readonly ClearableSelectOption<AppointmentListOrderValue>[]
  >(
    () => [
      { value: APPOINTMENT_LIST_ORDER.ASC, label: ascLabel },
      { value: APPOINTMENT_LIST_ORDER.DESC, label: descLabel },
    ],
    [ascLabel, descLabel],
  );

  function handleChange(next: AppointmentListOrderValue | "") {
    if (next === "") {
      return;
    }

    onChange(next);
  }

  return (
    <ClearableSelect<AppointmentListOrderValue>
      value={value}
      onChange={handleChange}
      options={options}
      label={label}
      size={size}
      required={required}
      disabled={disabled}
      fullWidth={fullWidth}
    />
  );
}
