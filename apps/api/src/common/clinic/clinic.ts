/**
 * Clinic-timezone helpers — F13 / F21.
 *
 * Recurring daily business rules (booking windows) are stored as wall-clock
 * minute-of-day in the clinic's local timezone. The conversion from a UTC
 * instant to the local minute-of-day happens at the check site, per
 * CLAUDE.md §9a. Centralising the env read + the conversion here keeps the
 * env-var name + default in ONE place (rule 2b) and the dayjs idiom
 * consistent across `SlotsService` and `AppointmentsService`.
 */

// Side-effect import — guarantees the `utc` + `timezone` plugins are
// registered before this module's helpers touch `dayjs.utc(...).tz(...)`.
// `main.ts` loads `../dayjs` at boot, but unit tests bypass `main.ts` so
// the plugins MUST be registered here too. Importing the module twice is
// safe — `dayjs.extend()` is idempotent.
import '../../dayjs';

import dayjs from 'dayjs';

import {
  CLINIC_TIMEZONE_ENV_VAR,
  DEFAULT_CLINIC_TIMEZONE,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
} from './clinic.const';

/**
 * Resolve the active clinic timezone. Returns the env-var value if set,
 * otherwise the safe default (`Asia/Bangkok`). The env-var name itself
 * comes from `CLINIC_TIMEZONE_ENV_VAR` per CLAUDE.md §2b.
 *
 * Reading `process.env` at call time (rather than caching) keeps tests
 * able to override the timezone with a single `process.env.CLINIC_TIMEZONE =`
 * before exercising a code path — no module-reset required.
 */
export function getClinicTimezone(): string {
  return process.env[CLINIC_TIMEZONE_ENV_VAR] ?? DEFAULT_CLINIC_TIMEZONE;
}

/**
 * Convert a UTC instant to the local wall-clock minute-of-day in the
 * clinic timezone. Returned value is in `[0, 1440)`.
 *
 * Inputs:
 *  - `instant`: a `Date` (Prisma row) or an ISO string (`dto.startAt`).
 *
 * Exported for direct call-site use AND unit tests; the conversion is
 * pure so tests can pin both `instant` and the timezone via env.
 */
export function localMinuteOfDay(instant: Date | string): number {
  const tz = getClinicTimezone();
  const local = dayjs.utc(instant).tz(tz);

  return local.hour() * MINUTES_PER_HOUR + local.minute();
}

/**
 * Day-rollover-aware booking-window membership for a SLOT across N ranges
 * (F21 — supersedes the F13/PR-#28 single-window `isWithinBookingWindow`).
 *
 * This is the SINGLE evaluation site for the booking-window rule. Both
 * `SlotsService` (per candidate slot) and `AppointmentsService.create`
 * (the proposed appointment back-stop) call it — guaranteeing the wizard
 * filter and the BE constraint can never disagree.
 *
 * Algorithm:
 *  - Empty `windows` → `true` (unrestricted; zero rows = any time is OK).
 *  - `startMin` = local minute-of-day of `slotStart` in `CLINIC_TIMEZONE`.
 *  - `endMin` is day-rollover-aware:
 *      rawEndMin = localEnd.hour()*60 + localEnd.minute()
 *      dayDiff   = localEnd.startOf('day').diff(localStart.startOf('day'), 'day')
 *      endMin    = rawEndMin + dayDiff * 1440
 *    A 23:30→00:00 slot yields `endMin = 1440`, NOT 0. Never calling
 *    `minuteOfDay(slotEnd)` directly for the comparison is what prevents
 *    the midnight-wrap class of bug.
 *  - A slot fits a window when:
 *      startMin >= window.startMinute && endMin <= window.endMinute
 *    (whole-slot containment — the slot must sit entirely inside the range).
 *  - Returns `true` when the slot fits ANY window (OR over all ranges).
 *
 * Pure function — relies only on its parameters and the clinic timezone
 * env var. Tests can override the timezone via `process.env.CLINIC_TIMEZONE`.
 */
export function isSlotWithinBookingWindows(
  slotStart: Date,
  slotEnd: Date,
  windows: ReadonlyArray<{ startMinute: number; endMinute: number }>,
): boolean {
  if (windows.length === 0) {
    return true;
  }

  const tz = getClinicTimezone();
  const localStart = dayjs.utc(slotStart).tz(tz);
  const localEnd = dayjs.utc(slotEnd).tz(tz);

  const startMin = localStart.hour() * MINUTES_PER_HOUR + localStart.minute();
  const rawEndMin = localEnd.hour() * MINUTES_PER_HOUR + localEnd.minute();

  // Day-rollover-aware end minute. `startOf('day').diff(...)` gives the
  // number of local calendar days the slot crosses. A 23:30→00:00 slot
  // crosses into the next local day → dayDiff = 1 → endMin = 0 + 1440 = 1440.
  const dayDiff = localEnd.startOf('day').diff(localStart.startOf('day'), 'day');
  const endMin = rawEndMin + dayDiff * MINUTES_PER_DAY;

  return windows.some(
    (w) => startMin >= w.startMinute && endMin <= w.endMinute,
  );
}
