"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import ClearableSelect, {
  type ClearableSelectOption,
} from "@/components/shared/select/ClearableSelect";
import { K, NS } from "@/i18n/keys.generated";
import { PATIENT_GENDER_OPTIONS } from "@/patient/registration-schema.const";
import type { PatientGender } from "@/types/patient.types";

interface GenderSelectProps {
  value: PatientGender | "";
  onChange: (next: PatientGender | "") => void;
  label: string;
  placeholder?: string;
  size?: "small" | "medium";
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  fullWidth?: boolean;
  /**
   * Optional accessible label for the × clear button. Defaults to
   * `Common.Select.clearAriaLabel`. Largely unused because gender is
   * required, but exposed for completeness.
   */
  clearAriaLabel?: string;
}

/**
 * Gender picker. Reads option labels from `Common.Gender.<code>` so the
 * patient form, future appointment-list patient-row chip, and any
 * future patient-edit screen share one localised string per code.
 *
 * Not clearable by default — the patient form treats `gender` as
 * required and the BE rejects an empty value. The wrapper deliberately
 * omits a `clearable` prop so a future call site can't accidentally
 * enable the × icon for a field whose schema doesn't allow `null`.
 */
export default function GenderSelect({
  value,
  onChange,
  label,
  placeholder,
  size,
  required,
  disabled,
  error,
  helperText,
  fullWidth,
  clearAriaLabel,
}: GenderSelectProps) {
  const tGender = useTranslations(NS.CommonGender);
  const tSelect = useTranslations(NS.CommonSelect);

  const options = useMemo<readonly ClearableSelectOption<PatientGender>[]>(
    () =>
      PATIENT_GENDER_OPTIONS.map((code) => ({
        value: code,
        label: tGender(K.Common.Gender[code]),
      })),
    [tGender],
  );

  return (
    <ClearableSelect<PatientGender>
      value={value}
      onChange={onChange}
      options={options}
      label={label}
      placeholder={placeholder}
      clearAriaLabel={
        clearAriaLabel ?? tSelect(K.Common.Select.clearAriaLabel)
      }
      size={size}
      required={required}
      disabled={disabled}
      error={error}
      helperText={helperText}
      fullWidth={fullWidth}
    />
  );
}
