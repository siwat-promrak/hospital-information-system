import { setRequestLocale } from "next-intl/server";

import { DASHBOARD_PATH, ROLE, type RoleCode } from "@/auth/roles";
import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { requireSession } from "@/lib/server/session";

interface HomePageProps {
  params: Promise<{ locale: AppLocale }>;
}

/**
 * Role dispatcher. Unauthenticated callers never reach this page — the
 * middleware redirects them to `/[locale]/signin` first. For authed
 * callers we route by `roleCode`:
 *
 *   ADMIN  → `/admin`
 *   STAFF  → `/staff`
 *   DOCTOR → `/me/schedule`
 *
 * Future custom roles (US-11.6) that are not yet in `DASHBOARD_PATH`
 * fall through to the staff dashboard as a sensible default; admins can
 * adjust as new roles come online.
 */
export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const destination =
    DASHBOARD_PATH[session.user.roleCode as RoleCode] ?? DASHBOARD_PATH[ROLE.STAFF];

  redirect({ href: destination, locale });
}
