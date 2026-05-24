/**
 * Derive avatar initials from a name string.
 *
 * Splits on whitespace and takes the first character of the first part
 * plus the first character of the last part. Falls back to the first two
 * characters when there is only one part (e.g. `"Anna"` → `"AN"`), and to
 * `?` when both `value` and `fallback` are empty.
 *
 *  - `value` — primary name source (e.g. a user's display name, a
 *    doctor's full name).
 *  - `fallback` — used when `value` is blank (e.g. an email address when
 *    the display name is unset).
 *
 * Returns uppercase ASCII so the result fits inside `<Avatar>` regardless
 * of the input casing.
 */
export function initialsFromName(value: string, fallback?: string): string {
  const source = value.trim() || fallback?.trim() || "";
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];

  if (!first) {
    return "?";
  }

  if (parts.length === 1 || !last) {
    return first.slice(0, 2).toUpperCase();
  }

  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}
