/**
 * Static auth-layer constants for the FE. NextAuth config + middleware read
 * these so renames propagate from one place.
 */
import { parsePositiveInt } from "@/lib/utils/parse";

import { FE_PATH } from "./routes";

const DEFAULT_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_SESSION_UPDATE_AGE_SECONDS = 60 * 60;

/**
 * Hard ceiling on the session JWT cookie. The cookie is invalid after this
 * window regardless of activity — the user must sign in again.
 *
 * Default: 7 days (`DEFAULT_SESSION_MAX_AGE_SECONDS`). Override at deploy
 * time with `SESSION_MAX_AGE_SECONDS` for tighter rotation in production
 * or shorter sessions during a security incident. NOT a secret — these
 * lifetimes are visible in the JWT `exp` claim.
 */
export const SESSION_MAX_AGE_SECONDS =
  parsePositiveInt(process.env.SESSION_MAX_AGE_SECONDS) ??
  DEFAULT_SESSION_MAX_AGE_SECONDS;

/**
 * Sliding-window renewal interval. NextAuth re-issues the cookie if the
 * current request happens more than this many seconds after the cookie was
 * last issued — so an active user is silently kept signed in up to
 * `maxAge` of inactivity, then locked out.
 *
 * Default: 1 hour (`DEFAULT_SESSION_UPDATE_AGE_SECONDS`). Override at
 * deploy time with `SESSION_UPDATE_AGE_SECONDS`. MUST be strictly less
 * than `SESSION_MAX_AGE_SECONDS`; the invariant is asserted below at
 * module load.
 */
export const SESSION_UPDATE_AGE_SECONDS =
  parsePositiveInt(process.env.SESSION_UPDATE_AGE_SECONDS) ??
  DEFAULT_SESSION_UPDATE_AGE_SECONDS;

if (SESSION_UPDATE_AGE_SECONDS >= SESSION_MAX_AGE_SECONDS) {
  throw new Error(
    `SESSION_UPDATE_AGE_SECONDS (${SESSION_UPDATE_AGE_SECONDS}) must be < SESSION_MAX_AGE_SECONDS (${SESSION_MAX_AGE_SECONDS}). Sliding-window renewal becomes a no-op otherwise.`,
  );
}

/**
 * Internal-route paths under `/[locale]/` that DO NOT require an
 * authenticated session. The middleware lets these through; everything
 * else redirects to `/[locale]/signin` with the original path captured in
 * `callbackUrl`.
 */
export const PUBLIC_LOCALE_PATHS: readonly string[] = [FE_PATH.SIGNIN];

/**
 * Backend rewrite prefix exposed to the browser. Requests to
 * `/api/be/<path>` are proxied (same-origin) to the NestJS API at
 * `${BACKEND_INTERNAL_URL}/api/v1/<path>` by `next.config.ts`. Used by FE
 * fetches that need to forward the session cookie.
 */
export const BACKEND_REWRITE_PREFIX = "/api/be";

/**
 * URI version prefix declared on the NestJS app via `enableVersioning`.
 * Every internal server-to-server call composes this with the controller
 * path (e.g. `/api/v1/auth/resolve`).
 */
export const API_VERSION_PREFIX = "/api/v1";

/**
 * Header carrying the shared server-to-server secret. Mirrors
 * `apps/api/src/auth/auth.const.ts` — the BE and FE MUST agree on the
 * exact (case-insensitive) header name.
 */
export const INTERNAL_SECRET_HEADER = "X-Internal-Secret";
