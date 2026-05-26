import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import List from "@mui/material/List";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import { PERMISSION_CODE } from "@/auth/permissions";
import PaginationControl from "@/components/shared/PaginationControl";
import ReferralListRow from "@/components/appointment/ReferralListRow";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { listAppointments } from "@/lib/api/appointment.api";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "@/lib/api/pagination.const";
import { parsePositiveInt } from "@/lib/utils/parse";
import { hasPermission, requireSession } from "@/lib/server/session";

interface ReferralsPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ page?: string }>;
}

/**
 * F14 referrals pickup queue (`/referrals`). Lists appointments referred
 * to the caller's department that haven't been picked up yet — each row
 * shows the source visit + a "Book follow-up" CTA that deep-links to the
 * booking wizard with the referral pre-filled.
 *
 * Auth: `appointment.read.own-department` OR `.all`. Callers without a
 * department (`session.user.departmentId === null`) and `.own-department`
 * permission can't materially do anything on this queue — they see the
 * forbidden card. `.all` callers see incoming referrals to every
 * department, but the BE auto-narrows on the caller's department when
 * one is present, so the query degrades to "all referrals" only when the
 * caller has no department.
 */
export default async function ReferralsPage({
  params,
  searchParams,
}: ReferralsPageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.Referrals);
  const tErrors = await getTranslations(NS.ReferralsErrors);

  const canViewReferrals = hasPermission(
    session,
    PERMISSION_CODE.APPOINTMENT_READ_OWN_DEPARTMENT,
    PERMISSION_CODE.APPOINTMENT_READ_ALL,
  );

  if (!canViewReferrals) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.Referrals.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  // `.own-department` callers without a department code can't have any
  // referrals routed to them — short-circuit to the empty card rather
  // than firing a BE call that would 403. `.all` (MRO) callers have no
  // department but legitimately see every department's queue.
  const hasAllScope = hasPermission(
    session,
    PERMISSION_CODE.APPOINTMENT_READ_ALL,
  );
  const callerDepartmentId = session.user.departmentId ?? undefined;

  if (!callerDepartmentId && !hasAllScope) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {t(K.Referrals.empty)}
        </Typography>
      </Card>
    );
  }

  const page = parsePositiveInt(pageParam) ?? DEFAULT_PAGE;
  const result = await listAppointments({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    pendingReferralOnly: true,
  });

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1" color="primary">
          {t(K.Referrals.title)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t(K.Referrals.subtitle)}
        </Typography>
      </Stack>

      <Card variant="outlined">
        {result.data.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {t(K.Referrals.empty)}
            </Typography>
          </Box>
        ) : (
          <List sx={{ py: 0 }}>
            {result.data.map((appointment) => (
              <ReferralListRow
                key={appointment.id}
                appointment={appointment}
                locale={locale}
              />
            ))}
          </List>
        )}
      </Card>

      <PaginationControl
        page={result.page}
        totalPages={result.totalPages}
        basePath={FE_PATH.REFERRALS}
        preservedQuery={{}}
      />
    </Stack>
  );
}
