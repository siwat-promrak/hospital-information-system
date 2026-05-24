/**
 * Static auth-layer constants. Kept in their own module so guards/services
 * never spell these strings inline — a single rename here propagates
 * everywhere.
 */

/**
 * Shared header used by the Next.js server when proxying server-to-server
 * calls to the API (currently only `POST /auth/resolve`). Matches the env
 * variable `INTERNAL_API_SECRET`.
 */
export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/**
 * Cookie names the API recognises as session-token carriers. Ordered so the
 * common case (Auth.js v5 default) is checked among the first matches; in
 * practice only one of these is set per request.
 *
 *  - `next-auth.session-token` / `__Secure-next-auth.session-token` —
 *    NextAuth v4 and v5 backwards-compatible names.
 *  - `authjs.session-token` / `__Secure-authjs.session-token` — Auth.js v5
 *    default.
 */
export const SESSION_COOKIE_NAMES: readonly string[] = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'authjs.session-token',
  '__Secure-authjs.session-token',
];
