import { setRequestLocale } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { requireSession } from "@/lib/server/session";

interface HomePageProps {
  params: Promise<{ locale: AppLocale }>;
}

/**
 * Role dispatcher. Unauthenticated callers never reach this page — the
 * middleware redirects them to `/[locale]/signin` first. For authed
 * callers we send everyone to the doctors directory (`/doctors`) as the
 * universal post-sign-in landing. The per-role dashboards have been
 * retired; permission-aware sidebar entries gate every downstream page,
 * so the directory is a sensible neutral landing for every role.
 */
export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  await requireSession();

  redirect({ href: FE_PATH.DOCTORS, locale });
}
