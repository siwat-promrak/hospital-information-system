/**
 * Department-colour palette used by the schedule calendar AND the
 * department legend. Lives outside both consumers so they share the same
 * deterministic mapping from `Department.id` → swatch colour.
 *
 * Colours are picked so adjacent entries don't collide on hue, and so the
 * set covers ≥ the seeded department count (10) without modulo wrap-around.
 * Each entry is a literal hex tuned for AA contrast against the chip
 * swatch background.
 *
 * The mapping is **position-indexed** against the supplied `departments`
 * array — the page passes the same sorted list to both the calendar and
 * the legend, so a given `Department.id` resolves to the same colour in
 * both surfaces.
 */

export const DEPARTMENT_COLOR_PALETTE: readonly string[] = [
  "#1976d2", // blue 700
  "#388e3c", // green 700
  "#f57c00", // orange 700
  "#d32f2f", // red 700
  "#7b1fa2", // purple 700
  "#0097a7", // cyan 700
  "#c2185b", // pink 700
  "#5d4037", // brown 700
  "#455a64", // blue grey 700
  "#fbc02d", // yellow 700
  "#7cb342", // light green 600
  "#5c6bc0", // indigo 400
];

/**
 * Build a `(departmentId) => colour` resolver against the supplied
 * department list. Position-indexed (not hash-indexed) so two adjacent
 * departments never share a swatch when the palette has more entries than
 * departments.
 *
 * Falls back to the first palette entry when `departmentId` is not in the
 * list (defensive — the page always supplies the full department set, but
 * a stale BE row would otherwise blow up with `undefined`).
 */
export function makeDepartmentColorResolver(
  departments: readonly { id: string }[],
): (departmentId: string) => string {
  return (departmentId: string): string => {
    const index = departments.findIndex((d) => d.id === departmentId);
    const safe = index >= 0 ? index : 0;

    return (
      DEPARTMENT_COLOR_PALETTE[safe % DEPARTMENT_COLOR_PALETTE.length] ??
      DEPARTMENT_COLOR_PALETTE[0]!
    );
  };
}
