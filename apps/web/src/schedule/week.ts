/**
 * Week-grid date helpers for the F06 calendar.
 *
 * The week view pixel-positions schedule blocks across a 7-day column
 * grid. The page reads `?weekStart=YYYY-MM-DD` from the URL — always an
 * ISO Monday — and computes:
 *
 *  - `weekRangeISO()`     — `from` / `to` (YYYY-MM-DD) bounds for the BE
 *                            list-schedules query (Monday → Sunday).
 *  - `buildWeekDays()`    — seven `Date`s starting at `weekStart` so the
 *                            week-view component can iterate columns.
 *  - `formatWeekLabel()`  — locale-aware "Mon, 25 May – Sun, 31 May 2026"
 *                            header label.
 *  - `addDays(d, delta)`  — day-arithmetic used by the view-aware
 *                            prev / next navigation in the week view.
 *
 * Mon-first matches the month view (and Thai convention). Every helper
 * is timezone-local — "this week" means the user's wall-clock week.
 *
 * All date math goes through dayjs (CLAUDE.md rule 9).
 */

import { dayjs } from "@/lib/dayjs";

/** Days in a week. */
export const WEEK_DAYS = 7;

const WEEK_START_PARAM_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Return the ISO Monday (start-of-day, local) of the week containing
 * `date`. Sunday is treated as the last day of the previous week, so
 * `mondayOf(Sunday)` returns the Monday six days earlier.
 */
export function mondayOf(date: Date): Date {
  // dayjs `.day()` is 0..6 with 0 == Sunday. Map to 0..6 with 0 == Monday
  // so subtracting lands on the Monday of the same ISO week.
  const d = dayjs(date);
  const dow = (d.day() + 6) % 7;

  return d.subtract(dow, "day").startOf("day").toDate();
}

/**
 * The ISO Monday (local) of the current week — used as the default
 * `weekStart` when the URL has no `?weekStart=` value.
 */
export function currentWeekStart(): Date {
  return mondayOf(new Date());
}

/**
 * Parse the `?weekStart=YYYY-MM-DD` URL value. Returns the current ISO
 * Monday when the value is missing, malformed, or not actually a Monday
 * (the param is user-editable, so a typo defaults gracefully). When the
 * value parses to a non-Monday date we snap to the Monday of that week
 * instead of erroring — the URL still represents "the week containing
 * this date" which matches user intent.
 */
export function parseWeekStartParam(raw: string | undefined): Date {
  if (!raw) {
    return currentWeekStart();
  }

  const match = WEEK_START_PARAM_REGEX.exec(raw);

  if (!match) {
    return currentWeekStart();
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return currentWeekStart();
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return currentWeekStart();
  }

  const parsed = dayjs()
    .year(year)
    .month(month - 1)
    .date(day)
    .startOf("day");

  if (!parsed.isValid()) {
    return currentWeekStart();
  }

  // Always snap to Monday — even if the URL hands us a Wednesday, the
  // view is "the week containing this date".
  return mondayOf(parsed.toDate());
}

/**
 * Serialise a Monday-anchored `Date` back to its `YYYY-MM-DD` URL form
 * (local timezone — matches the parser).
 */
export function formatWeekStartParam(weekStart: Date): string {
  return dayjs(weekStart).format("YYYY-MM-DD");
}

/**
 * Shift a date by `delta` days (positive or negative). Used by the
 * view-aware header navigation in the week view (±7 days for prev / next).
 */
export function addDays(date: Date, delta: number): Date {
  return dayjs(date).add(delta, "day").toDate();
}

export interface WeekRangeISO {
  /** Monday of the week, `YYYY-MM-DD` local. */
  from: string;
  /** Sunday of the week, `YYYY-MM-DD` local. */
  to: string;
}

/**
 * Monday-of / Sunday-of `YYYY-MM-DD` strings for `weekStart`. Used as the
 * `from` / `to` parameters of the BE list-schedules query so a week view
 * never pulls schedules outside its own bounds.
 */
export function weekRangeISO(weekStart: Date): WeekRangeISO {
  const monday = dayjs(weekStart);
  const sunday = monday.add(WEEK_DAYS - 1, "day");

  return {
    from: monday.format("YYYY-MM-DD"),
    to: sunday.format("YYYY-MM-DD"),
  };
}

/**
 * Build a 7-day `Date[]` starting at `weekStart` (Monday). The week-view
 * component iterates this list to render one column per day.
 */
export function buildWeekDays(weekStart: Date): Date[] {
  const start = dayjs(weekStart);
  const days: Date[] = [];

  for (let i = 0; i < WEEK_DAYS; i += 1) {
    days.push(start.add(i, "day").toDate());
  }

  return days;
}

/**
 * Locale-aware "Mon, 25 May – Sun, 31 May 2026" label for the week-header.
 * Uses dayjs's `localizedFormat` `LL` token for the per-locale long-form
 * date and joins the two ends with an en-dash.
 */
export function formatWeekLabel(weekStart: Date, locale: string): string {
  const monday = dayjs(weekStart).locale(locale);
  const sunday = monday.add(WEEK_DAYS - 1, "day");

  return `${monday.format("LL")} – ${sunday.format("LL")}`;
}
