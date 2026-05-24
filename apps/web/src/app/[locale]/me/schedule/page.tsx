import { getTranslations, setRequestLocale } from "next-intl/server";

import RoleDashboard from "@/components/RoleDashboard";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { requireSession } from "@/lib/server/session";

interface DoctorScheduleEditorPageProps {
  params: Promise<{ locale: AppLocale }>;
}

/**
 * Placeholder DOCTOR landing — `/me/schedule` is the route that F06's
 * own-schedule editor will own. For now it renders the shared welcome
 * + permission summary; the real CRUD UI replaces this body in F06.
 */
export default async function DoctorScheduleEditorPage({
  params,
}: DoctorScheduleEditorPageProps) {
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
      comingSoonMessage={t(K.Dashboard.comingSoonDoctor)}
    />
  );
}
