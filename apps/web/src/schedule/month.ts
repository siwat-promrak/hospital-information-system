/**
 * Month-grid date helpers for the F06 calendar.
 *
 * The page reads `?month=YYYY-MM` from the URL, falls back to the current
 * month in the user's local timezone, and computes:
 *
 *  - `monthRangeISO()`     — `from` / `to` (YYYY-MM-DD) bounds for the BE
 *                             list-schedules query.
 *  - `buildMonthGrid()`    — six rows of seven `Date`s, padded with the
 *                             trailing days of the prior month and the
 *                             leading days of the next so a full month
 *                             grid always renders 6×7 cells.
 *  - `formatMonthLabel()`  — locale-aware "May 2026" header label.
 *  - `weekdayHeaders()`    — locale-aware short weekday labels (Mon..Sun
 *                             when `weekStart === "monday"`).
 *
 * Every helper is timezone-local on purpose — the user expects "May" to
 * mean "their May", not UTC's, and the BE stores zoned instants.
 *
 * All date math goes through dayjs (CLAUDE.md rule 9).
 */

import { dayjs } from "@/lib/dayjs";

/** Maximum number of rows the month grid can ever need (5- or 6-week months). */
export const MONTH_GRID_ROWS = 6;
/** Days per grid row. */
export const MONTH_GRID_COLUMNS = 7;

export type WeekStart = "monday" | "sunday";

export interface MonthParam {
  /** Four-digit year (e.g. `2026`). */
  year: number;
  /** 1-indexed month (`1` == January, `12` == December). */
  month: number;
}

export interface MonthRangeISO {
  /** First day of the month, `YYYY-MM-DD` in local time. */
  from: string;
  /** Last day of the month, `YYYY-MM-DD` in local time. */
  to: string;
}

const MONTH_PARAM_REGEX = /^(\d{4})-(\d{2})$/;

function dayjsMonthParam({ year, month }: MonthParam) {
  // dayjs is 0-indexed on month; the `MonthParam` is 1-indexed to match the
  // URL form. `.date(1)` anchors to the first of the month to avoid the
  // "Jan 31 + 1 month = Mar 3" overflow trap.
  return dayjs().year(year).month(month - 1).date(1).startOf("day");
}

/**
 * Parse the `?month=YYYY-MM` URL value. Returns the current month in the
 * user's local timezone when the value is missing or malformed — the URL
 * is user-editable, so a typo defaults gracefully instead of erroring.
 */
export function parseMonthParam(raw: string | undefined): MonthParam {
  const fallback = currentMonth();

  if (!raw) {
    return fallback;
  }

  const match = MONTH_PARAM_REGEX.exec(raw);

  if (!match) {
    return fallback;
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return fallback;
  }

  if (month < 1 || month > 12) {
    return fallback;
  }

  return { year, month };
}

/**
 * Serialise a `MonthParam` back to its `YYYY-MM` URL form.
 */
export function formatMonthParam({ year, month }: MonthParam): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/**
 * The month immediately before the given one — wraps year on January.
 */
export function previousMonth(param: MonthParam): MonthParam {
  return addMonths(param, -1);
}

/**
 * The month immediately after the given one — wraps year on December.
 */
export function nextMonth(param: MonthParam): MonthParam {
  return addMonths(param, 1);
}

/**
 * Shift `month` by `delta` months (positive or negative). Wraps year
 * boundaries via dayjs's overflow handling. Used by the view-aware header
 * navigation (prev / next in month view) so the caller doesn't have to
 * chain `previousMonth` / `nextMonth` calls.
 */
export function addMonths(param: MonthParam, delta: number): MonthParam {
  const shifted = dayjsMonthParam(param).add(delta, "month");

  return { year: shifted.year(), month: shifted.month() + 1 };
}

/**
 * The month containing today (user's local timezone).
 */
export function currentMonth(): MonthParam {
  const now = dayjs();

  return { year: now.year(), month: now.month() + 1 };
}

/**
 * First-of-month / last-of-month `YYYY-MM-DD` strings, intended as the
 * `from` / `to` parameters of the BE list-schedules query. Local time —
 * the BE compares against `startAt`'s instant; a date-only filter is
 * inclusive on both bounds.
 */
export function monthRangeISO(param: MonthParam): MonthRangeISO {
  const first = dayjsMonthParam(param);
  const last = first.endOf("month");

  return {
    from: first.format("YYYY-MM-DD"),
    to: last.format("YYYY-MM-DD"),
  };
}

/**
 * Build a 6-rows-by-7-days `Date[][]` grid for the given month. Leading
 * cells are pulled from the trailing days of the prior month and trailing
 * cells from the leading days of the next so the grid is always rectangular
 * (and the caller's CSS doesn't have to think about row-count variation).
 *
 * `weekStart` is `"monday"` for both en + th (the calendar is Mon-first in
 * Thailand by convention and the brief picks Mon-first regardless).
 */
export function buildMonthGrid(
  param: MonthParam,
  weekStart: WeekStart = "monday",
): Date[][] {
  const firstOfMonth = dayjsMonthParam(param);
  // dayjs `.day()` is 0..6 with 0 == Sunday. Shift so Monday becomes 0
  // when `weekStart === "monday"`.
  const rawDow = firstOfMonth.day();
  const dowFromWeekStart =
    weekStart === "monday" ? (rawDow + 6) % 7 : rawDow;
  const gridStart = firstOfMonth.subtract(dowFromWeekStart, "day");

  const rows: Date[][] = [];
  let cursor = gridStart;

  for (let r = 0; r < MONTH_GRID_ROWS; r += 1) {
    const row: Date[] = [];

    for (let c = 0; c < MONTH_GRID_COLUMNS; c += 1) {
      row.push(cursor.toDate());
      cursor = cursor.add(1, "day");
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Locale-aware "May 2026" label for the month-header. Uses the
 * `localizedFormat` `MMMM YYYY` tokens so the month name follows the
 * caller's locale.
 */
export function formatMonthLabel(param: MonthParam, locale: string): string {
  return dayjsMonthParam(param).locale(locale).format("MMMM YYYY");
}

/**
 * Seven short weekday labels (e.g. `["Mon", "Tue", ...]`) starting from
 * `weekStart`. Sourced from dayjs's locale data so the locale + script
 * decide the format — no hand-rolled translation needed.
 */
export function weekdayHeaders(
  locale: string,
  weekStart: WeekStart = "monday",
): string[] {
  // 2024-01-01 is a Monday — pick it as the anchor so the slice math is
  // unambiguous regardless of locale week-start.
  const monday = dayjs("2024-01-01").locale(locale);
  const offset = weekStart === "monday" ? 0 : -1;
  const labels: string[] = [];

  for (let i = 0; i < MONTH_GRID_COLUMNS; i += 1) {
    labels.push(monday.add(offset + i, "day").format("ddd"));
  }

  return labels;
}

/**
 * `true` when `date` falls in the given `MonthParam`'s calendar month
 * (local timezone). Used to grey out adjacent-month cells in the grid.
 */
export function isInMonth(date: Date, { year, month }: MonthParam): boolean {
  const d = dayjs(date);

  return d.year() === year && d.month() === month - 1;
}
