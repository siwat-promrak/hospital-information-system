import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// Detects the locale (via Accept-Language / cookie) and redirects `/` to the right
// prefix. Also rewrites/redirects for any other route missing a locale prefix.
export default createMiddleware(routing);

export const config = {
  // Match all paths except Next.js internals, API routes, and static assets.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
