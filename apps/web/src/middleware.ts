import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { auth } from "@/auth";
import { PUBLIC_LOCALE_PATHS } from "@/auth/auth.const";
import { FE_PATH } from "@/auth/routes";
import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const LOCALE_PREFIX_PATTERN = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

/**
 * Composed middleware:
 *   1. Delegate to next-intl to resolve the locale + emit any locale
 *      redirect (e.g. `/` → `/en`).
 *   2. If the resolved URL points at a public path (`/[locale]/signin`),
 *      return the intl response untouched.
 *   3. Otherwise, consult NextAuth's `auth()` helper. Unauthenticated
 *      callers are redirected to `/[locale]/signin?callbackUrl=<orig>`.
 *
 * The matcher excludes `/api/*`, Next.js internals, and any path with an
 * extension (static assets) so neither the intl middleware nor the auth
 * gate intercepts NextAuth's own route handlers or static files.
 */
export default async function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  // Path the intl middleware decided to route to. If the original URL is
  // missing a locale, this is the redirect target (`/en/...`); otherwise
  // it's the same as the incoming pathname.
  const intlLocation =
    intlResponse.headers.get("x-middleware-rewrite") ??
    intlResponse.headers.get("location");
  const targetPath = intlLocation
    ? new URL(intlLocation, request.nextUrl.origin).pathname
    : request.nextUrl.pathname;

  const locale = extractLocale(targetPath);
  const pathWithoutLocale = stripLocale(targetPath);

  if (isPublicPath(pathWithoutLocale)) {
    return intlResponse;
  }

  // If the intl middleware already chose to redirect (e.g. adding the
  // locale prefix), let it propagate before running the auth check so the
  // user lands on a stable URL.
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  const session = await auth();

  if (!session?.user?.userId) {
    const signInUrl = new URL(
      `/${locale}${FE_PATH.SIGNIN}`,
      request.nextUrl.origin,
    );
    const callback = request.nextUrl.pathname + request.nextUrl.search;

    if (callback !== "/" && callback !== `/${locale}`) {
      signInUrl.searchParams.set("callbackUrl", callback);
    }

    return NextResponse.redirect(signInUrl);
  }

  return intlResponse;
}

function extractLocale(pathname: string): string {
  const match = pathname.match(LOCALE_PREFIX_PATTERN);

  return match?.[1] ?? routing.defaultLocale;
}

function stripLocale(pathname: string): string {
  return pathname.replace(LOCALE_PREFIX_PATTERN, "") || "/";
}

function isPublicPath(pathWithoutLocale: string): boolean {
  return PUBLIC_LOCALE_PATHS.some(
    (publicPath) =>
      pathWithoutLocale === publicPath ||
      pathWithoutLocale.startsWith(`${publicPath}/`),
  );
}

export const config = {
  // Exclude Next.js internals, all API routes (NextAuth's handlers AND
  // the /api/be/* rewrite), and static assets.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
