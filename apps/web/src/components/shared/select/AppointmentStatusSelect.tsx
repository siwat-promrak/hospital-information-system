"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import ClearableSelect, {
  type ClearableSelectOption,
} from "@/components/shared/select/ClearableSelect";
import { K, NS } from "@/i18n/keys.generated";
import {
  APPOINTMENT_STATUS,
  type AppointmentStatusValue,
} from "@/lib/api/appointment.const";

interface AppointmentStatusSelectProps {
  value: AppointmentStatusValue | "";
  onChange: (next: AppointmentStatusValue | "") => void;
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
}

/**
 * Ordered status list — the catalog comes from `APPOINTMENT_STATUS` so
 * a new Prisma status (e.g. a future `NO_SHOW`) lights up the picker
 * once it lands in both the BE enum and the FE mirror.
 *
 * Kept at the module scope so the order is stable across renders (no
 * `Object.values` reshuffle per render).
 */
const STATUS_ORDER: readonly AppointmentStatusValue[] = [
  APPOINTMENT_STATUS.BOOKED,
  APPOINTMENT_STATUS.CANCELLED,
  APPOINTMENT_STATUS.COMPLETED,
];

/**
 * Appointment-status picker. Reads option labels from the
 * `Common.AppointmentStatus.<code>` i18n catalog so the dropdown stays
 * in sync with the status badges on the appointment list / detail
 * pages.
 *
 * Caller passes the contextual label ("Status", "Filter by status",
 * …) — the wrapper does not fabricate a default because each call
 * site has its own surrounding copy.
 */
export default function AppointmentStatusSelect({
  value,
  onChange,
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
}: AppointmentStatusSelectProps) {
  const tStatus = useTranslations(NS.CommonAppointmentStatus);
  const tSelect = useTranslations(NS.CommonSelect);

  const options = useMemo<
    readonly ClearableSelectOption<AppointmentStatusValue>[]
  >(
    () =>
      STATUS_ORDER.map((code) => ({
        value: code,
        label: tStatus(K.Common.AppointmentStatus[code]),
      })),
    [tStatus],
  );

  return (
    <ClearableSelect<AppointmentStatusValue>
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
