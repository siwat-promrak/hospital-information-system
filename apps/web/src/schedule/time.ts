/**
 * Schedule-specific calendar constants + read-only predicate.
 *
 * Generic date helpers (`parseISODatetime`, `formatTime`, `formatDate`,
 * `toISODateLocal`, `combineDateAndTime`, `extractDate`, `extractTime`,
 * `toLocalHHMM`, `isSameLocalDate`) live in `@/lib/utils/date` — they
 * have no schedule knowledge and are reused across the app. Re-export from
 * here would just hide the import, so each call site imports from the
 * utils module directly.
 *
 * This file keeps:
 *   - Calendar geometry constants (visible hour range + row height) — they
 *     describe the F06 week-view grid specifically.
 *   - `isScheduleReadOnly` — domain predicate over `ScheduleResponse`'s
 *     `endAt`.
 */

import { isEndedISO } from "@/lib/utils/date";

/**
 * First hour rendered by the week-view pixel grid. The grid currently
 * displays the full day (00:00–24:00) so this is `0`; schedules that
 * straddle midnight in the user's local time still clamp at the top
 * with an indicator if the start instant falls on the previous local day.
 */
export const CALENDAR_DAY_START_HOUR = 0;
/**
 * Last hour rendered by the week-view pixel grid (exclusive — the column
 * stops at `END_HOUR:00`). Set to `24` to render every hour of the day;
 * schedules that bleed into the next local day clamp at the bottom with
 * an indicator.
 */
export const CALENDAR_DAY_END_HOUR = 24;
/**
 * Height in pixels of one hour-row in the week grid. The grid total
 * height = `(END - START) * ROW_HEIGHT_PX`.
 */
export const CALENDAR_ROW_HEIGHT_PX = 60;

/**
 * A schedule is read-only when it has fully ended (`endAt <= now`). The
 * cutoff is client-local; this is a UX guard, not a security guarantee
 * (the BE remains the authority).
 *
 * Ongoing schedules (`startAt <= now < endAt`) stay editable so a user
 * can still mark them closed-to-bookings or shorten the end time mid-shift.
 */
export function isScheduleReadOnly(
  schedule: { endAt: string },
  now: Date = new Date(),
): boolean {
  return isEndedISO(schedule.endAt, now);
}
