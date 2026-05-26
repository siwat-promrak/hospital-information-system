/**
 * Clinic-timezone helpers — F13.
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
 * clinic timezone. Returned value is in `[0, 1440)` — the same domain
 * as `DepartmentAppointmentType.bookingWindowStartMinute`.
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
 * Half-open booking-window membership for a SLOT (not a single instant):
 * the whole interval `[slotStartMin, slotEndMin)` must fit inside
 * `[windowStartMin, windowEndMin)`. Either bound may be null =
 * open-ended on that side; both null = always inside.
 *
 * Bug history: a previous single-minute-of-day variant only checked
 * `slotStart < windowEnd`, which let a 30-min slot at 10:40 local pass a
 * 11:00 window-end (the slot actually ends at 11:10 — past the window).
 * The current two-bound check rejects that case.
 *
 * NOTE: assumes slots do NOT cross local midnight (clinic schedules are
 * intraday). If a future overnight schedule needs support, `slotEndMin`
 * will roll back to a small value and the `slotEndMin <= windowEndMin`
 * comparison will be wrong — handle explicitly at the call site.
 *
 * Pure function — exported so `SlotsService` (slot grid filter) and
 * `AppointmentsService.create` (create back-stop) call exactly the same
 * predicate.
 */
export function isWithinBookingWindow(
  slotStartMin: number,
  slotEndMin: number,
  windowStartMin: number | null,
  windowEndMin: number | null,
): boolean {
  if (windowStartMin !== null && slotStartMin < windowStartMin) {
    return false;
  }

  if (windowEndMin !== null && slotEndMin > windowEndMin) {
    return false;
  }

  return true;
}
