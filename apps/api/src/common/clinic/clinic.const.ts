/**
 * Clinic-wide constants shared across F13 (per-(department, type) booking
 * rules) and any future feature that needs to interpret wall-clock
 * minute-of-day fields stored on `department_appointment_types`.
 *
 * Per CLAUDE.md §2b, the env-var NAME is a constant — call sites import
 * `CLINIC_TIMEZONE_ENV_VAR` rather than inlining the literal `"CLINIC_TIMEZONE"`.
 */

/**
 * Name of the env var that overrides the IANA clinic timezone used by
 * the per-pair booking-window math (F13). Consumed by `getClinicTimezone()`
 * (see `clinic.ts`).
 */
export const CLINIC_TIMEZONE_ENV_VAR = 'CLINIC_TIMEZONE' as const;

/**
 * Fallback IANA timezone used when the env var is missing. Pinned to
 * Asia/Bangkok so a missing env fails safe to the clinic's local zone.
 */
export const DEFAULT_CLINIC_TIMEZONE = 'Asia/Bangkok' as const;

/**
 * Number of minutes in one wall-clock day. Used as the upper bound for
 * `bookingWindowEndMinute` (inclusive) and as the open-ended sentinel
 * when callers convert a half-open `[start, end)` window to a closed
 * range.
 */
export const MINUTES_PER_DAY = 1440 as const;

/**
 * Number of minutes in one wall-clock hour. Convenience constant for
 * call sites that compose `hour * MINUTES_PER_HOUR + minute`.
 */
export const MINUTES_PER_HOUR = 60 as const;
