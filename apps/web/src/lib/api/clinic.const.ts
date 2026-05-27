/**
 * Clinic-wide constants mirrored from the BE's `apps/api/src/common/clinic/`
 * (per CLAUDE.md §2b — domain-carrying minute-of-day boundaries do not
 * inline as literals). A future `packages/shared` workspace will dedupe
 * with the BE; until then the two catalogs are mirrored verbatim.
 */

/**
 * Local midnight expressed as wall-clock minute-of-day in the clinic's
 * timezone — the inclusive lower bound of any booking-window range.
 * A range that starts at local midnight is stored with
 * `startMinute = MIDNIGHT_MINUTES` (i.e. `0`).
 */
export const MIDNIGHT_MINUTES = 0 as const;

/**
 * Number of minutes in one wall-clock day. Doubles as the "until local
 * midnight" sentinel for a booking-window range's exclusive upper bound:
 * `endMinute = MINUTES_PER_DAY` (i.e. `1440`) means the range runs up to
 * (but not through) the next local midnight. Mirrors the BE's
 * `MINUTES_PER_DAY` in `apps/api/src/common/clinic/clinic.const.ts`.
 */
export const MINUTES_PER_DAY = 1440 as const;
