import { getTranslations, setRequestLocale } from "next-intl/server";

import RoleDashboard from "@/components/shared/RoleDashboard";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { requireSession } from "@/lib/server/session";

interface AdminDashboardPageProps {
  params: Promise<{ locale: AppLocale }>;
}

/**
 * Placeholder ADMIN landing. Replaced by the real
 * `(admin)/admin/users/page.tsx` etc. when F11 lands. For now it just
 * renders the shared welcome + permission summary so reviewers can
 * verify the role dispatcher + RBAC plumbing end-to-end.
 */
export default async function AdminDashboardPage({ params }: AdminDashboardPageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.Dashboard);

  return (
    <RoleDashboard
      name={session.user.name ?? session.user.email ?? ""}
      roleCode={session.user.roleCode}
      permissionCodes={session.user.permissionCodes}
      comingSoonMessage={t(K.Dashboard.comingSoonAdmin)}
    />
  );
}
