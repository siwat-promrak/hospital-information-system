/**
 * Typed catalog of OAuth providers wired into NextAuth. Single source of
 * truth so `signIn(...)` calls, `account.provider` comparisons, and any
 * future provider switches share the same identifier.
 *
 * Adding a new provider:
 *   1. Add the entry here (UPPER_SNAKE_CASE key, lowercase value matching
 *      the NextAuth provider id).
 *   2. Register the provider in `src/auth.ts` `providers[]`.
 *   3. Update the sign-in UI if the new provider has its own button.
 */

export const OAUTH_PROVIDER = {
  GOOGLE: "google",
} as const;

export type OAuthProvider = (typeof OAUTH_PROVIDER)[keyof typeof OAUTH_PROVIDER];
