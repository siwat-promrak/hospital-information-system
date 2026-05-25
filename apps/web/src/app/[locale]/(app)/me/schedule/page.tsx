import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import { PERMISSION_CODE } from "@/auth/permissions";
import ScheduleCalendar from "@/components/schedule/ScheduleCalendar";
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
  monthRangeISO,
  parseMonthParam,
} from "@/schedule/month";
import {
  parseWeekStartParam,
  weekRangeISO,
} from "@/schedule/week";

interface DoctorScheduleEditorPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{
    view?: string;
    month?: string;
    weekStart?: string;
  }>;
}

function resolveView(raw: string | undefined): ScheduleView {
  if (raw === SCHEDULE_VIEW.WEEK) {
    return SCHEDULE_VIEW.WEEK;
  }

  return SCHEDULE_VIEW.MONTH;
}

/**
 * F06 own-schedule view for DOCTOR callers. Re-uses `ScheduleCalendar`
 * but pre-pins `lockedDoctorId` so the modal cannot create rows for
 * other doctors.
 *
 * Contract assumption: when a DOCTOR session lists `/schedules` without a
 * `doctorId` query param, the BE auto-scopes to the caller's own doctor
 * record (matching the documented service-layer own-doctor scope rule).
 * The first schedule's `doctorId` is therefore safe to treat as the
 * caller's id; if the list is empty, the calendar renders the
 * "no schedules yet" empty state and disables the create affordance until
 * an admin seeds the doctor's department affiliation.
 */
export default async function DoctorScheduleEditorPage({
  params,
  searchParams,
}: DoctorScheduleEditorPageProps) {
  const { locale } = await params;
  const {
    view: rawView,
    month: monthParam,
    weekStart: weekStartParam,
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

  // BE auto-scopes the listing to the caller's own doctor row when no
  // `doctorId` filter is set (see `apps/api/src/schedules/schedule.scope.ts`).
  // `PAGE_SIZE_ALL` bounded by `from`/`to` guarantees the calendar never
  // silently truncates the tail of a busy month/week.
  const schedulesResult = await listSchedules({
    pageSize: PAGE_SIZE_ALL,
    from,
    to,
  });

  const lockedDoctorId = schedulesResult.data[0]?.doctorId;

  // Doctors + departments fuel the modal even though only one doctor is
  // editable (`lockedDoctorId` keeps the field disabled). Fetching them
  // unconditionally keeps the create path one click away the first time
  // the doctor lands on the page. Doctors are fetched with a small
  // initial page; the modal pages through the rest on scroll via the
  // `loadDoctorsPageAction` server action.
  const [doctorsResult, departmentsResult] = await Promise.all([
    listDoctors({
      page: DEFAULT_PAGE,
      pageSize: DOCTOR_INFINITE_SCROLL_PAGE_SIZE,
    }),
    listDepartments({ pageSize: MAX_PAGE_SIZE }),
  ]);

  // When the doctor has no schedules yet (and therefore no derivable id),
  // the calendar shows the empty-doctor copy and skips the create button —
  // the doctor cannot submit a body the BE will accept without a valid id.
  const canManage = Boolean(lockedDoctorId);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1" color="primary">
          {tSchedules(K.Schedules.myTitle)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {tSchedules(K.Schedules.mySubtitle)}
        </Typography>
      </Box>
      <ScheduleCalendar
        schedules={schedulesResult.data}
        doctors={doctorsResult.data}
        doctorsTotal={doctorsResult.total}
        initialDoctorPage={doctorsResult.page}
        departments={departmentsResult.data}
        view={view}
        month={month}
        weekStart={weekStart}
        basePath={FE_PATH.DOCTOR_SCHEDULE}
        lockedDoctorId={lockedDoctorId}
        canManage={canManage}
      />
    </Stack>
  );
}
