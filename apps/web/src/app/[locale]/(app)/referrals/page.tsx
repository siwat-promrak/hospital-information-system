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
import { getMe } from "@/lib/api/auth.api";
import { fetchDoctorPickerSeed } from "@/lib/api/doctor.actions";
import { getDoctor } from "@/lib/api/doctor.api";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "@/lib/api/pagination.const";
import { parsePositiveInt } from "@/lib/utils/parse";
import { hasPermission, requireSession } from "@/lib/server/session";
import type { DoctorListRow } from "@/types/doctor.types";

interface ReferralsPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ page?: string }>;
}

/**
 * F14 referrals pickup queue (`/referrals`). Lists appointments referred
 * to the caller's department that haven't been picked up yet — each row
 * shows the source visit + a primary "Book" CTA that opens an inline
 * booking dialog (doctor + appointment type + date + slot) without
 * leaving the queue.
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

  // The inline Book dialog on each row needs the same booking-permission
  // shape the standalone wizard page resolves — caller's create scope,
  // their own doctor row (when locked to self-booking), and the doctor
  // picker SSR seed scoped to the caller's department. Resolved once on
  // the page so every row reuses the same plumbing instead of refetching
  // per-dialog-open.
  const canBook = hasPermission(
    session,
    PERMISSION_CODE.APPOINTMENT_CREATE_OWN,
    PERMISSION_CODE.APPOINTMENT_CREATE_OWN_DEPARTMENT,
  );

  const isCreateOwnOnly =
    hasPermission(session, PERMISSION_CODE.APPOINTMENT_CREATE_OWN) &&
    !hasPermission(
      session,
      PERMISSION_CODE.APPOINTMENT_CREATE_OWN_DEPARTMENT,
    );

  let lockedDoctor: DoctorListRow | undefined;

  if (canBook && isCreateOwnOnly) {
    const me = await getMe();

    if (me.doctor) {
      lockedDoctor = await getDoctor(me.doctor.id);
    }
  }

  const page = parsePositiveInt(pageParam) ?? DEFAULT_PAGE;

  const [result, doctorSeed] = await Promise.all([
    listAppointments({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      pendingReferralOnly: true,
    }),
    canBook
      ? fetchDoctorPickerSeed({ departmentId: callerDepartmentId })
      : Promise.resolve(undefined),
  ]);

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
                canBook={canBook}
                doctorSeed={doctorSeed}
                doctorScopeDepartmentId={callerDepartmentId}
                lockedDoctor={lockedDoctor}
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
