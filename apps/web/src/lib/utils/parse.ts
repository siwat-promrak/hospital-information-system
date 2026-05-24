/**
 * Parse a string into a positive integer.
 *
 * Returns `null` for missing, empty, non-numeric, non-finite, or
 * non-positive input so callers can fall back to a default without
 * separately checking for each failure mode.
 */
export function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}
