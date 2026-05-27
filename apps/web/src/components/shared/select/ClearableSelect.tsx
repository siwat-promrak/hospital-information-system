"use client";

import CloseIcon from "@mui/icons-material/Close";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { useCallback, useId, useMemo } from "react";

/**
 * One option in a `<ClearableSelect>` dropdown. `value` is the wire code
 * that lands in form state on selection; `label` is the user-visible
 * pre-translated string the caller passes in.
 */
export interface ClearableSelectOption<V extends string | number> {
  value: V;
  label: string;
}

export interface ClearableSelectProps<V extends string | number> {
  /**
   * Currently-selected option value, or the empty-string sentinel when no
   * option is picked. The empty-string sentinel matches the controlled-
   * state convention MUI's `<Select>` uses internally and lets the
   * component stay generic over `V` without leaking `null` into the wire
   * code domain.
   */
  value: V | "";
  /**
   * Fired on selection change with the new option's `value` — or the
   * empty-string sentinel when the user clicks the × clear icon (only
   * possible while `clearable === true`).
   */
  onChange: (next: V | "") => void;
  /** Full option list shown in the dropdown. */
  options: readonly ClearableSelectOption<V>[];
  /** Field label shown inside the input frame + as the floating label. */
  label: string;
  /**
   * Show a × clear icon as part of the input's `endAdornment` whenever
   * `value !== ""`. Clicking it fires `onChange("")`. Suppressed when
   * `disabled === true`. Default `false` — opt in per call site where
   * the field genuinely has a "no value" state (filter dropdowns,
   * optional form fields).
   */
  clearable?: boolean;
  /**
   * Optional caller-supplied accessible label for the × button. Defaults
   * to the english "Clear" — pass an i18n-resolved string when the
   * surrounding form has a localised "Clear X" copy worth exposing to
   * assistive tech (e.g. "Clear department filter").
   */
  clearAriaLabel?: string;
  /** MUI density. Forwarded to the `<FormControl>`. */
  size?: "small" | "medium";
  /** Marks the field required for native form semantics + visual marker. */
  required?: boolean;
  /** Disables the underlying `<Select>` and suppresses the × clear icon. */
  disabled?: boolean;
  /** Renders the field in the error colour (border, label, helper text). */
  error?: boolean;
  /**
   * Helper text shown under the input. Pair with `error` for validation
   * messages; pair with neutral copy for "Auto-narrowed to your
   * department"-style hints.
   */
  helperText?: string;
  /**
   * Optional placeholder. When provided we use MUI's `displayEmpty` +
   * `renderValue` so the placeholder text shows in the input slot while
   * `value === ""` — but the dropdown options list shows ONLY the real
   * options. The placeholder is never a clickable entry in the menu (the
   * input-slot text is the only place it surfaces).
   */
  placeholder?: string;
  /** Full-width by default; pass `fullWidth={false}` to opt out. */
  fullWidth?: boolean;
}

/**
 * Default aria-label used when the caller doesn't override `clearAriaLabel`.
 * The string is plain English on purpose — the component stays free of
 * `useTranslations` so it can drop into both i18n and non-i18n surfaces.
 * Callers who want a localised label (e.g. "Clear department filter") pass
 * `clearAriaLabel` explicitly from their own `useTranslations` bag.
 */
const DEFAULT_CLEAR_ARIA_LABEL = "Clear";

/**
 * Reserved right-edge gap inside the input frame so the × clear icon
 * doesn't overlap the chevron MUI `<Select>` draws via its `IconComponent`
 * slot. Same value used by `AppointmentListFilter`'s legacy inline
 * implementation — keep in lockstep so the visual rhythm matches.
 */
const CLEAR_ICON_RIGHT_GAP = 3;

/**
 * Generic single-select primitive that wraps the
 * `FormControl + InputLabel + Select + × clear adornment + helperText`
 * boilerplate. Every entity-aware select in
 * `apps/web/src/components/shared/select/` composes on top of this
 * primitive — call sites should reach for the matching entity wrapper
 * (`<DepartmentSelect>`, `<AppointmentStatusSelect>`, …) rather than
 * dropping this primitive into a feature module directly.
 *
 * The component is i18n-free on purpose. Option labels arrive
 * pre-translated via the `options` prop; the × button's aria-label
 * defaults to a generic english "Clear" and the caller may override via
 * `clearAriaLabel` when a localised string is worth exposing to
 * assistive tech. This split keeps the primitive reusable across
 * surfaces with different i18n bags while still letting an enclosing
 * wrapper inject a contextual label like "Clear department filter".
 */
export default function ClearableSelect<V extends string | number>({
  value,
  onChange,
  options,
  label,
  clearable,
  clearAriaLabel,
  size,
  required,
  disabled,
  error,
  helperText,
  placeholder,
  fullWidth,
}: ClearableSelectProps<V>) {
  // Stable label id so InputLabel + Select stay paired even when the
  // component is rendered multiple times on a page (e.g. two filter
  // dropdowns with the same `label` prop).
  const reactId = useId();
  const labelId = `${reactId}-label`;
  const isFullWidth = fullWidth !== false;
  const showClearIcon = Boolean(clearable) && value !== "" && !disabled;
  const ariaLabel = clearAriaLabel ?? DEFAULT_CLEAR_ARIA_LABEL;
  // Whether to render the placeholder copy in the input slot when
  // `value === ""`. Without `displayEmpty`, MUI hides the input value
  // entirely while empty — the floating label fills the space and the
  // user sees no hint of what belongs there. We pair `displayEmpty` with
  // a `renderValue` that returns the placeholder for `""` and the
  // matching option's label otherwise — that keeps the placeholder OUT
  // of the dropdown options list (it lives only in the input slot).
  const showPlaceholder = Boolean(placeholder);

  const renderValue = useMemo(() => {
    if (!showPlaceholder) {
      return undefined;
    }

    function renderSelected(selected: V | "") {
      if (selected === "") {
        return (
          <span style={{ opacity: 0.6 }}>{placeholder}</span>
        );
      }

      const match = options.find((opt) => opt.value === selected);

      return match ? match.label : String(selected);
    }

    return renderSelected;
  }, [showPlaceholder, placeholder, options]);

  const handleChange = useCallback(
    (event: SelectChangeEvent<V | "">) => {
      onChange(event.target.value as V | "");
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange("");
  }, [onChange]);

  // Sit the × icon inside `endAdornment`. MUI's `<Select>` draws the
  // chevron via its own `IconComponent` slot — that lives in absolute
  // positioning at the right edge, so we leave a `mr` gap on the
  // adornment to avoid overlap. Same convention the legacy inline
  // implementation in `AppointmentListFilter` used; lifting it here so
  // every consumer stays in lockstep.
  const endAdornment = useMemo(() => {
    if (!showClearIcon) {
      return undefined;
    }

    return (
      <InputAdornment position="end" sx={{ mr: CLEAR_ICON_RIGHT_GAP }}>
        <IconButton
          size="small"
          aria-label={ariaLabel}
          onClick={handleClear}
          edge="end"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </InputAdornment>
    );
  }, [showClearIcon, ariaLabel, handleClear]);

  return (
    <FormControl
      fullWidth={isFullWidth}
      size={size}
      required={required}
      disabled={disabled}
      error={error}
    >
      <InputLabel
        id={labelId}
        // When a placeholder is in play the input slot always carries
        // copy (either the placeholder text or the matched option's
        // label) — force the label into the shrunken position so it
        // doesn't overlap the placeholder/value at rest. Leaving
        // `shrink` undefined preserves MUI's value-driven default for
        // the no-placeholder case.
        shrink={showPlaceholder ? true : undefined}
      >
        {label}
      </InputLabel>
      <Select<V | "">
        labelId={labelId}
        label={label}
        value={value}
        onChange={handleChange}
        displayEmpty={showPlaceholder}
        renderValue={renderValue}
        endAdornment={endAdornment}
        // Pair with the shrunken InputLabel above so the outlined
        // input's border notch sits open (matching the shrunken label)
        // instead of slicing through the placeholder text.
        notched={showPlaceholder ? true : undefined}
      >
        {options.map((option) => (
          <MenuItem key={String(option.value)} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
    </FormControl>
  );
}
