/**
 * Generic dayjs-backed date / time helpers with no domain knowledge.
 *
 * The wire contract carries datetimes as ISO 8601 strings (zoned). The UI
 * splits the create/edit modal into a `<input type="date">` + two
 * `<input type="time">` fields — these helpers are the seam between the
 * two representations.
 *
 * Per CLAUDE.md rule 9, every date math operation goes through dayjs.
 * Direct `Date` arithmetic is forbidden — the `dayjs` re-export here is
 * the only way callers ever construct one.
 *
 * "Locale" math is intentional: the user expects "today" to mean their
 * wall-clock today, and the BE round-trips the same instant. Combining a
 * date + time field uses `dayjs(...)` (browser-local) and serialises via
 * `.toISOString()` so the BE receives a UTC-anchored instant.
 */

import { dayjs } from "@/lib/dayjs";

/** Regex for the `HH:MM` 24-hour input emitted by `<input type="time">`. */
const HHMM_REGEX = /^(\d{1,2}):(\d{2})$/;
/** Regex for the `YYYY-MM-DD` value emitted by `<input type="date">`. */
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict format for combining a local date + time pair. */
const LOCAL_DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm";

/**
 * Parse an ISO datetime string into a `Date`. Returns `null` on malformed
 * input so callers can fall back without rethrowing.
 *
 * The wire format is ISO-8601 and dayjs handles that natively — no plugin
 * required.
 */
export function parseISODatetime(value: string): Date | null {
  const parsed = dayjs(value);

  if (!parsed.isValid()) {
    return null;
  }

  return parsed.toDate();
}

/**
 * Format a `Date` as a locale-aware `HH:MM` (24-hour) wall-clock string
 * via the `localizedFormat` `HH:mm` token (locale `en` / `th` both render
 * 24h here, so the format is stable across the two supported locales).
 */
export function formatTime(date: Date, locale: string): string {
  return dayjs(date).locale(locale).format("HH:mm");
}

/**
 * Format a `Date` as a locale-aware long-form date (e.g. `Mon, 25 May 2026`).
 * Uses the `ddd, D MMM YYYY` token explicitly — `LL` would drop the
 * weekday, and the calendar headers always want the weekday up front.
 */
export function formatDate(date: Date, locale: string): string {
  return dayjs(date).locale(locale).format("ddd, D MMM YYYY");
}

/**
 * Format a `Date` as a `YYYY-MM-DD` string in the *local* timezone (NOT
 * UTC). `dayjs.toISOString()` shifts to UTC and would emit the wrong
 * calendar date for users east of GMT — for a calendar where "today"
 * means the user's wall-clock today, this is what we want.
 */
export function toISODateLocal(date: Date): string {
  return dayjs(date).format("YYYY-MM-DD");
}

/**
 * Extract the local-date `YYYY-MM-DD` portion of an ISO datetime string.
 * Returns `""` when the value is malformed so callers can fall back to a
 * placeholder without an extra null-check.
 */
export function extractDate(iso: string): string {
  const parsed = dayjs(iso);

  if (!parsed.isValid()) {
    return "";
  }

  return parsed.format("YYYY-MM-DD");
}

/**
 * Extract the local-time `HH:MM` portion of an ISO datetime string.
 * Returns `""` when the value is malformed.
 */
export function extractTime(iso: string): string {
  const parsed = dayjs(iso);

  if (!parsed.isValid()) {
    return "";
  }

  return parsed.format("HH:mm");
}

/**
 * Format a `Date` as a `HH:MM` (24-hour) string in the *local* timezone.
 * Used to pre-fill the `<input type="time">` inside the modal from an
 * existing ISO datetime.
 */
export function toLocalHHMM(date: Date): string {
  return dayjs(date).format("HH:mm");
}

/**
 * Combine a `YYYY-MM-DD` date string + an `HH:MM` time string into an ISO
 * datetime in the user's local timezone, suitable for the wire contract.
 * Returns `null` if either input is malformed.
 *
 * Parses strictly via `customParseFormat` so a partial / garbled input
 * (e.g. `"2026-13-01"`) fails closed instead of normalising silently.
 */
export function combineDateAndTime(
  dateISO: string,
  timeHHMM: string,
): string | null {
  if (!ISO_DATE_REGEX.test(dateISO)) {
    return null;
  }

  if (!HHMM_REGEX.test(timeHHMM)) {
    return null;
  }

  const combined = dayjs(`${dateISO} ${timeHHMM}`, LOCAL_DATE_TIME_FORMAT, true);

  if (!combined.isValid()) {
    return null;
  }

  return combined.toDate().toISOString();
}

/**
 * `true` when `a` and `b` fall on the same calendar date in the local
 * timezone.
 */
export function isSameLocalDate(a: Date, b: Date): boolean {
  return dayjs(a).isSame(dayjs(b), "day");
}

/**
 * `true` when `date` is wholly before today in the user's local timezone
 * (i.e. yesterday or earlier). Today returns `false`. Used to gate UI
 * affordances that should not allow creating a schedule on a past day.
 */
export function isPastDateLocal(date: Date, now: Date = new Date()): boolean {
  return dayjs(date).startOf("day").isBefore(dayjs(now).startOf("day"));
}

/**
 * Today's date as a `YYYY-MM-DD` local-timezone string. Used to seed
 * `min` / `defaultValue` on `<input type="date">`.
 */
export function todayLocalISODate(now: Date = new Date()): string {
  return dayjs(now).format("YYYY-MM-DD");
}

/**
 * `true` when the schedule has fully ended (`endAt <= now`). The cutoff
 * is client-local; this is a UX guard, not a security guarantee.
 *
 * Ongoing schedules (`startAt <= now < endAt`) stay editable so a user
 * can still mark them closed-to-bookings or shorten the end time mid-shift.
 */
export function isEndedISO(endAt: string, now: Date = new Date()): boolean {
  const end = dayjs(endAt);

  if (!end.isValid()) {
    return false;
  }

  return end.isSameOrBefore(dayjs(now));
}

/**
 * Compare two ISO-8601 datetime strings. Returns `-1`, `0`, or `1` to
 * match `Array.prototype.sort` semantics.
 *
 * Use instead of `localeCompare` on ISO strings — `localeCompare` only
 * works on the BE's UTC-`Z` form by accident; this helper is correct for
 * any valid ISO-8601 input.
 */
export function compareISODatetime(a: string, b: string): number {
  const da = dayjs(a);
  const db = dayjs(b);

  if (da.isBefore(db)) {
    return -1;
  }

  if (da.isAfter(db)) {
    return 1;
  }

  return 0;
}
