import { getTranslations, setRequestLocale } from "next-intl/server";

import RoleDashboard from "@/components/RoleDashboard";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { requireSession } from "@/lib/server/session";

interface StaffDashboardPageProps {
  params: Promise<{ locale: AppLocale }>;
}

/**
 * Placeholder STAFF landing. Replaced by the real
 * `(staff)/appointments/page.tsx` and `(staff)/patients/page.tsx` when
 * F05 / F08 land.
 */
export default async function StaffDashboardPage({ params }: StaffDashboardPageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.Dashboard);

  return (
    <RoleDashboard
      locale={locale}
      name={session.user.name ?? session.user.email ?? ""}
      roleCode={session.user.roleCode}
      permissionCodes={session.user.permissionCodes}
      comingSoonMessage={t(K.Dashboard.comingSoonStaff)}
    />
  );
}
