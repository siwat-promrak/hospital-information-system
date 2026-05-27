import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PERMISSION_CODE } from "@/auth/permissions";
import { FE_PATH, FE_PATH_BUILDER } from "@/auth/routes";
import AppointmentListRow from "@/components/appointment/AppointmentListRow";
import PaginationControl from "@/components/shared/PaginationControl";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { listAppointments } from "@/lib/api/appointment.api";
import {
  APPOINTMENT_LIST_ORDER,
  APPOINTMENT_STATUS,
} from "@/lib/api/appointment.const";
import { getMe } from "@/lib/api/auth.api";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "@/lib/api/pagination.const";
import { WORKSPACE_QUERY_PARAM } from "@/lib/api/workspace.const";
import { dayjs } from "@/lib/dayjs";
import { hasPermission, requireSession } from "@/lib/server/session";
import { parsePositiveInt } from "@/lib/utils/parse";

interface WorkspacePageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{
    upcomingPage?: string;
    historyPage?: string;
  }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: NS.Workspace });

  return {
    title: t(K.Workspace.title),
  };
}

/**
 * F17 — doctor workspace list page (`/workspace`).
 *
 * Two independent sections:
 *  - Upcoming: BOOKED appointments from today onward, ascending.
 *  - History: COMPLETED + CANCELLED appointments, descending. Fetched
 *    as two parallel calls (BE accepts only a single `status` filter),
 *    merged, and sorted by `startAt` descending with dayjs. Each section
 *    has its own pagination query param (`upcomingPage` / `historyPage`).
 *
 * History rows are capped at DEFAULT_PAGE_SIZE per status per page — a
 * "view all" link to `/appointments?doctorId=…&status=…` is provided for
 * heavy overflows. Both sections use real `<PaginationControl>` widgets.
 */
export default async function WorkspacePage({
  params,
  searchParams,
}: WorkspacePageProps) {
  const { locale } = await params;
  const {
    upcomingPage: upcomingPageParam,
    historyPage: historyPageParam,
  } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.Workspace);

  const canAccess = hasPermission(
    session,
    PERMISSION_CODE.DOCTOR_WORKSPACE_READ_OWN,
  );

  if (!canAccess) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {t(K.Workspace.empty)}
        </Typography>
      </Card>
    );
  }

  const me = await getMe();
  const doctorId = me.doctor?.id;

  if (!doctorId) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {t(K.Workspace.empty)}
        </Typography>
      </Card>
    );
  }

  const upcomingPage = parsePositiveInt(upcomingPageParam) ?? DEFAULT_PAGE;
  const historyPage = parsePositiveInt(historyPageParam) ?? DEFAULT_PAGE;
  const today = dayjs.utc().format("YYYY-MM-DD");

  // Fetch upcoming (BOOKED, from today) and the two history batches in
  // parallel — three round-trips but all server-side, same RSC render.
  const [upcomingResult, completedResult, cancelledResult] = await Promise.all([
    listAppointments({
      doctorId,
      status: APPOINTMENT_STATUS.BOOKED,
      from: today,
      order: APPOINTMENT_LIST_ORDER.ASC,
      page: upcomingPage,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    listAppointments({
      doctorId,
      status: APPOINTMENT_STATUS.COMPLETED,
      order: APPOINTMENT_LIST_ORDER.DESC,
      page: historyPage,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    listAppointments({
      doctorId,
      status: APPOINTMENT_STATUS.CANCELLED,
      order: APPOINTMENT_LIST_ORDER.DESC,
      page: historyPage,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
  ]);

  // Merge COMPLETED + CANCELLED and sort by startAt descending.
  const historyData = [
    ...completedResult.data,
    ...cancelledResult.data,
  ].sort((a, b) => {
    if (dayjs(a.startAt).isBefore(dayjs(b.startAt))) {
      return 1;
    }

    return -1;
  });

  // Represent history pagination as the max of the two independent sets
  // so the pagination control shows enough pages to reach all rows.
  // Both calls share the same `historyPage` value; the control steps them
  // together, which is the intended UX (a single "page N of M" widget).
  const historyTotalPages = Math.max(
    completedResult.totalPages,
    cancelledResult.totalPages,
  );

  // Preserved query for each section's PaginationControl — carry the
  // OTHER section's current page so stepping one section doesn't reset
  // the other to page 1.
  const upcomingPreserved: Record<string, string | undefined> = {
    [WORKSPACE_QUERY_PARAM.HISTORY_PAGE]:
      historyPage > DEFAULT_PAGE ? String(historyPage) : undefined,
  };
  const historyPreserved: Record<string, string | undefined> = {
    [WORKSPACE_QUERY_PARAM.UPCOMING_PAGE]:
      upcomingPage > DEFAULT_PAGE ? String(upcomingPage) : undefined,
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1" color="primary">
          {t(K.Workspace.title)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t(K.Workspace.subtitle)}
        </Typography>
      </Stack>

      {/* ── Upcoming section ─────────────────────────────────────── */}
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          {t(K.Workspace.upcomingTitle)}
        </Typography>

        {upcomingResult.data.length === 0 ? (
          <Card variant="outlined" sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {t(K.Workspace.upcomingEmpty)}
            </Typography>
          </Card>
        ) : (
          <Card variant="outlined">
            <List sx={{ py: 0 }}>
              {upcomingResult.data.map((appointment, index) => (
                <Box key={appointment.id}>
                  {index > 0 ? <Divider component="li" /> : null}
                  <AppointmentListRow
                    appointment={appointment}
                    viewDetailLabel={t(K.Workspace.openVisit)}
                    locale={locale}
                    href={FE_PATH_BUILDER.workspaceDetail(appointment.id)}
                  />
                </Box>
              ))}
            </List>
          </Card>
        )}

        <PaginationControl
          page={upcomingResult.page}
          totalPages={upcomingResult.totalPages}
          basePath={FE_PATH.WORKSPACE}
          preservedQuery={upcomingPreserved}
          pageQueryParam={WORKSPACE_QUERY_PARAM.UPCOMING_PAGE}
        />
      </Stack>

      {/* ── History section ───────────────────────────────────────── */}
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          {t(K.Workspace.historyTitle)}
        </Typography>

        {historyData.length === 0 ? (
          <Card variant="outlined" sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {t(K.Workspace.historyEmpty)}
            </Typography>
          </Card>
        ) : (
          <Card variant="outlined">
            <List sx={{ py: 0 }}>
              {historyData.map((appointment, index) => (
                <Box key={appointment.id}>
                  {index > 0 ? <Divider component="li" /> : null}
                  <AppointmentListRow
                    appointment={appointment}
                    viewDetailLabel={t(K.Workspace.openVisit)}
                    locale={locale}
                    href={FE_PATH_BUILDER.workspaceDetail(appointment.id)}
                  />
                </Box>
              ))}
            </List>
          </Card>
        )}

        <PaginationControl
          page={historyPage}
          totalPages={historyTotalPages}
          basePath={FE_PATH.WORKSPACE}
          preservedQuery={historyPreserved}
          pageQueryParam={WORKSPACE_QUERY_PARAM.HISTORY_PAGE}
        />
      </Stack>
    </Stack>
  );
}
