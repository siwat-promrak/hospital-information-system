/**
 * Doctor display helpers — locale-aware name formatting for both rich
 * `DoctorListRow` rows (carries server-precomputed `fullName`) and the
 * thin `ScheduleDoctorRef` embedded in every `ScheduleResponse`.
 *
 * Centralised here so a single rule decides English-vs-Thai everywhere
 * the UI prints a doctor's name. Today the BE only carries `firstNameEn`
 * / `lastNameEn` on `DoctorListRow.fullName`, so the `th` fallback only
 * kicks in when the embedded ref carries non-null Thai variants — F12 will
 * expand this once the doctor directory exposes Thai names too.
 */
import type { ScheduleDoctorRef } from "@/types/schedule.types";

/**
 * The minimum shape needed to format a doctor name. Matches both
 * `ScheduleDoctorRef` (and a subset of `DoctorListRow`) so callers can
 * pass whichever rich type they already have without converting first.
 *
 * Inlined rather than a re-export so the dependency direction stays one-
 * way (`schedule.types` doesn't have to import from here).
 */
export interface DoctorNameSource {
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh?: string | null;
  lastNameTh?: string | null;
}

/**
 * "Firstname Lastname" — Thai variant when the caller's locale is `th`
 * AND the row carries both Thai name parts; falls back to the English
 * pair otherwise. Trimmed so an empty surname doesn't leave a trailing
 * space.
 *
 * The BE schedule list endpoint joins through the User model so
 * `ScheduleDoctorRef` (the thin embedded ref) always carries every name
 * field — the fallback path is for rows whose Thai name is unset, not
 * for missing data.
 */
export function formatDoctorName(
  locale: string,
  ref: DoctorNameSource,
): string {
  if (
    locale === "th" &&
    ref.firstNameTh &&
    ref.lastNameTh
  ) {
    return `${ref.firstNameTh} ${ref.lastNameTh}`.trim();
  }

  return `${ref.firstNameEn} ${ref.lastNameEn}`.trim();
}

/**
 * Convenience wrapper for the `ScheduleDoctorRef` embedded in every
 * `ScheduleResponse`. Avoids the caller having to import
 * `DoctorNameSource` separately when they already have a schedule row.
 */
export function formatScheduleDoctorName(
  locale: string,
  doctor: ScheduleDoctorRef,
): string {
  return formatDoctorName(locale, doctor);
}
