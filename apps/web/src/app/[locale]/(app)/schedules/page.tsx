import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import { PERMISSION_CODE } from "@/auth/permissions";
import ScheduleCalendar from "@/components/schedule/ScheduleCalendar";
import ScheduleFilter from "@/components/schedule/ScheduleFilter";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { listDepartments } from "@/lib/api/department.api";
import { listDoctors } from "@/lib/api/doctor.api";
import { DOCTOR_INFINITE_SCROLL_PAGE_SIZE } from "@/lib/api/doctor.const";
import {
  DEFAULT_PAGE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_ALL,
} from "@/lib/api/pagination.const";
import { listSchedules } from "@/lib/api/schedule.api";
import { SCHEDULE_VIEW, type ScheduleView } from "@/lib/api/schedule.const";
import { hasPermission, requireSession } from "@/lib/server/session";
import {
  formatMonthParam,
  monthRangeISO,
  parseMonthParam,
} from "@/schedule/month";
import {
  formatWeekStartParam,
  parseWeekStartParam,
  weekRangeISO,
} from "@/schedule/week";

interface SchedulesPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{
    view?: string;
    month?: string;
    weekStart?: string;
    departmentId?: string;
  }>;
}

function resolveView(raw: string | undefined): ScheduleView {
  if (raw === SCHEDULE_VIEW.WEEK) {
    return SCHEDULE_VIEW.WEEK;
  }

  return SCHEDULE_VIEW.MONTH;
}

/**
 * F06 schedule calendar — STAFF / ADMIN view. Renders every dated
 * schedule inside the focused range with two visualisations:
 *
 *  - Month view (`?view=month&month=YYYY-MM`) — 6×7 grid, one cell per
 *    calendar date, schedule chips inside each cell.
 *  - Week view (`?view=week&weekStart=YYYY-MM-DD`) — 7-column pixel grid
 *    with schedules positioned by start / end time.
 *
 * Click an empty cell / column area to create; click a chip / block to
 * edit / delete via the dialog. Doctors + departments are fetched
 * alongside the schedules so the modal can drive its doctor → department
 * dependency without a client-side round-trip.
 *
 * Pagination: this page intentionally requests `pageSize=all` for the
 * schedules call, bounded by `from` / `to` covering the focused range, so
 * the calendar never silently truncates the tail of a busy month/week.
 * The `from` / `to` filter already caps the row count to a small number,
 * which is what makes the `all` sentinel safe here.
 *
 * Doctors are fetched with a small initial page so the SSR payload stays
 * lean, and the dialog (`ScheduleFormDialog`) loads further pages
 * on-demand as the user scrolls the doctor picker. See `doctor.const.ts`
 * for the shared page-size constant.
 */
export default async function SchedulesPage({
  params,
  searchParams,
}: SchedulesPageProps) {
  const { locale } = await params;
  const {
    view: rawView,
    month: monthParam,
    weekStart: weekStartParam,
    departmentId,
  } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const tSchedules = await getTranslations(NS.Schedules);
  const tErrors = await getTranslations(NS.SchedulesErrors);

  if (!hasPermission(session, PERMISSION_CODE.SCHEDULE_MANAGE)) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.Schedules.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  const view = resolveView(rawView);
  const month = parseMonthParam(monthParam);
  const weekStart = parseWeekStartParam(weekStartParam);

  const { from, to } =
    view === SCHEDULE_VIEW.MONTH
      ? monthRangeISO(month)
      : weekRangeISO(weekStart);

  const [departmentsResult, doctorsResult, schedulesResult] = await Promise.all([
    listDepartments({ pageSize: MAX_PAGE_SIZE }),
    listDoctors({
      page: DEFAULT_PAGE,
      pageSize: DOCTOR_INFINITE_SCROLL_PAGE_SIZE,
      departmentId,
    }),
    listSchedules({ pageSize: PAGE_SIZE_ALL, departmentId, from, to }),
  ]);

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 2, md: 3 }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
      >
        <Box>
          <Typography variant="h4" component="h1" color="primary">
            {tSchedules(K.Schedules.title)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tSchedules(K.Schedules.subtitle)}
          </Typography>
        </Box>
        <ScheduleFilter
          departments={departmentsResult.data}
          activeDepartmentId={departmentId ?? null}
          basePath={FE_PATH.SCHEDULES}
          view={view}
          month={formatMonthParam(month)}
          weekStart={formatWeekStartParam(weekStart)}
        />
      </Stack>
      <ScheduleCalendar
        schedules={schedulesResult.data}
        doctors={doctorsResult.data}
        doctorsTotal={doctorsResult.total}
        initialDoctorPage={doctorsResult.page}
        doctorDepartmentId={departmentId}
        departments={departmentsResult.data}
        view={view}
        month={month}
        weekStart={weekStart}
        basePath={FE_PATH.SCHEDULES}
        currentDepartmentId={departmentId}
        canManage
      />
    </Stack>
  );
}
