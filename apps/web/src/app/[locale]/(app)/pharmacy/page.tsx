import { getTranslations, setRequestLocale } from "next-intl/server";

import RoleDashboard from "@/components/shared/RoleDashboard";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { requireSession } from "@/lib/server/session";

interface PharmacyDashboardPageProps {
  params: Promise<{ locale: AppLocale }>;
}

/**
 * Placeholder PHARMACY landing. Replaced by the real pharmacy UI
 * (org-wide appointment + patient lookups for medication dispensing) when
 * F08+ lands. For now it just renders the shared welcome + permission
 * summary so reviewers can verify the role dispatcher + RBAC plumbing
 * end-to-end.
 */
export default async function PharmacyDashboardPage({ params }: PharmacyDashboardPageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.Dashboard);

  return (
    <RoleDashboard
      name={session.user.name ?? session.user.email ?? ""}
      roleCode={session.user.roleCode}
      permissionCodes={session.user.permissionCodes}
      comingSoonMessage={t(K.Dashboard.comingSoonPharmacy)}
    />
  );
}
