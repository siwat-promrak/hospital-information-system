/**
 * Normalize an email for storage and lookup.
 *
 * Every email column in the database is stored lowercased + trimmed.
 * Every write and lookup MUST route through this helper so that
 * application-layer uniqueness matches the (case-insensitive) intent of the
 * `@unique` constraints in `schema.prisma`.
 *
 * The helper is intentionally pure (no I/O, no DB) so it can be unit-tested
 * and reused from non-Nest contexts (e.g. the Prisma seed script).
 */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}
