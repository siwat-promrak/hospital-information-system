"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import ClearableSelect, {
  type ClearableSelectOption,
} from "@/components/shared/select/ClearableSelect";
import { K, NS } from "@/i18n/keys.generated";
import { PATIENT_BLOOD_GROUP_OPTIONS } from "@/patient/registration-schema.const";
import type { PatientBloodGroup } from "@/types/patient.types";

interface BloodGroupSelectProps {
  value: PatientBloodGroup | "";
  onChange: (next: PatientBloodGroup | "") => void;
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
   * `Common.Select.clearAriaLabel`. The picker doesn't expose a × by
   * default (UNKNOWN is the explicit "no value" option) but the prop
   * stays here for symmetry across the wrapper family.
   */
  clearAriaLabel?: string;
}

/**
 * Blood-group picker. Reads option labels from
 * `Common.BloodGroup.<code>` — most codes (A+, O-, etc.) are
 * non-i18n'd typography, but `UNKNOWN` translates to Thai on the th
 * locale so the catalog still does meaningful work.
 *
 * Not clearable — the BE defaults to `UNKNOWN` when the field is
 * omitted, so the picker exposes `UNKNOWN` at the top of the list as
 * the explicit "no value yet" option rather than offering a × clear.
 * The patient form leans on this contract (its `helperText` reads
 * "Defaults to Unknown if you skip it").
 */
export default function BloodGroupSelect({
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
}: BloodGroupSelectProps) {
  const tBloodGroup = useTranslations(NS.CommonBloodGroup);
  const tSelect = useTranslations(NS.CommonSelect);

  const options = useMemo<
    readonly ClearableSelectOption<PatientBloodGroup>[]
  >(
    () =>
      PATIENT_BLOOD_GROUP_OPTIONS.map((code) => ({
        value: code,
        label: tBloodGroup(K.Common.BloodGroup[code]),
      })),
    [tBloodGroup],
  );

  return (
    <ClearableSelect<PatientBloodGroup>
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
