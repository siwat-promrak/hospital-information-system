import Stack from "@mui/material/Stack";
import { getTranslations, setRequestLocale } from "next-intl/server";

import DashboardQuickActions from "@/components/shared/DashboardQuickActions";
import RoleDashboard from "@/components/shared/RoleDashboard";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { requireSession } from "@/lib/server/session";

interface MedicalRecordsOfficerDashboardPageProps {
  params: Promise<{ locale: AppLocale }>;
}

/**
 * MEDICAL_RECORDS_OFFICER landing page. Renders the F09 quick-action
 * cards (org-wide appointments + patient registration) above the shared
 * role dashboard placeholder, which keeps the welcome + permission
 * summary visible for reviewers.
 */
export default async function MedicalRecordsOfficerDashboardPage({
  params,
}: MedicalRecordsOfficerDashboardPageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.Dashboard);

  return (
    <Stack spacing={3}>
      <DashboardQuickActions
        permissionCodes={session.user.permissionCodes}
      />
      <RoleDashboard
        name={session.user.name ?? session.user.email ?? ""}
        roleCode={session.user.roleCode}
        permissionCodes={session.user.permissionCodes}
        comingSoonMessage={t(K.Dashboard.comingSoonMedicalRecordsOfficer)}
      />
    </Stack>
  );
}
