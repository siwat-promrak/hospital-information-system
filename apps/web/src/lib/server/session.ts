import "server-only";

import { auth } from "@/auth";

/**
 * Wrapper around NextAuth v5's `auth()` helper for use inside server
 * components / route handlers. Returns the typed session (including our
 * `user.userId` / `user.roleCode` / `user.permissionCodes` augmentation)
 * or `null` if no valid cookie is present.
 */
export async function getServerSession() {
  return auth();
}

/**
 * Same as `getServerSession()` but treats a missing session as a hard
 * error. Intended for server components reached after the middleware
 * already gated the route — the middleware redirects unauthenticated
 * callers to `/[locale]/signin`, so by the time a protected RSC runs the
 * session MUST be present. Throwing here surfaces the contract violation
 * loudly instead of returning `null`.
 */
export async function requireSession() {
  const session = await getServerSession();

  if (!session?.user?.userId) {
    throw new Error(
      "requireSession() was called from an unauthenticated request — the middleware should have redirected.",
    );
  }

  return session;
}

/**
 * Convenience: `true` when the caller holds any of the requested codes.
 * Mirrors the `@RequirePermission()` any-of semantics on the API side.
 */
export function hasPermission(
  session: Awaited<ReturnType<typeof getServerSession>>,
  ...codes: readonly string[]
): boolean {
  const held = session?.user?.permissionCodes ?? [];

  return codes.some((code) => held.includes(code));
}
