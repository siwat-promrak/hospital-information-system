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
 *   ADMIN                   → `/admin`
 *   DOCTOR                  → `/schedules` (unified permission-aware page)
 *   NURSE                   → `/nurse`
 *   MEDICAL_RECORDS_OFFICER → `/medical-records-officer`
 *   PHARMACY                → `/pharmacy`
 *
 * Future custom roles (US-11.6) that are not yet in `DASHBOARD_PATH`
 * fall through to the nurse dashboard as a sensible default — admins can
 * adjust as new roles come online. (NURSE is the closest analog to the
 * old front-desk default; the BE allow-list keeps this safe.)
 */
export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const destination =
    DASHBOARD_PATH[session.user.roleCode as RoleCode] ?? DASHBOARD_PATH[ROLE.NURSE];

  redirect({ href: destination, locale });
}
