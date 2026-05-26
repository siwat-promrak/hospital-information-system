import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import DepartmentLegend from "@/components/schedule/DepartmentLegend";
import ScheduleCalendar from "@/components/schedule/ScheduleCalendar";
import ScheduleDepartmentFilter from "@/components/schedule/ScheduleDepartmentFilter";
import ScheduleDoctorFilter from "@/components/schedule/ScheduleDoctorFilter";
import ScheduleViewModeSwitch from "@/components/schedule/ScheduleViewModeSwitch";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { getMe } from "@/lib/api/auth.api";
import { listDepartments } from "@/lib/api/department.api";
import { fetchDoctorPickerSeed } from "@/lib/api/doctor.actions";
import {
  MAX_PAGE_SIZE,
  PAGE_SIZE_ALL,
} from "@/lib/api/pagination.const";
import { listSchedules } from "@/lib/api/schedule.api";
import {
  SCHEDULE_QUERY_PARAM,
  SCHEDULE_SCOPE,
  SCHEDULE_VIEW,
  type ScheduleScope,
  type ScheduleView,
} from "@/lib/api/schedule.const";
import { resolveScheduleWriteCapabilities } from "@/schedule/permissions";
import {
  resolveScheduleViewMode,
  SCHEDULE_VIEW_MODE,
  type ScheduleViewMode,
} from "@/schedule/view-mode";
import { requireSession } from "@/lib/server/session";
import {
  formatMonthParam,
  parseMonthParam,
  visibleMonthRangeISO,
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
    doctorId?: string;
    scope?: string;
  }>;
}

function resolveView(raw: string | undefined): ScheduleView {
  if (raw === SCHEDULE_VIEW.WEEK) {
    return SCHEDULE_VIEW.WEEK;
  }

  return SCHEDULE_VIEW.MONTH;
}

/**
 * Default to "mine" on first visit — a doctor's own rows are the primary
 * use case, so the toggle starts narrowed rather than dumping them into
 * a department-wide view they didn't ask for.
 */
function resolveScope(raw: string | undefined): ScheduleScope {
  if (raw === SCHEDULE_SCOPE.DEPT) {
    return SCHEDULE_SCOPE.DEPT;
  }

  return SCHEDULE_SCOPE.MINE;
}

/**
 * Per-mode page heading. Inlined rather than a helper because the typed
 * `as const` keys must reach `tSchedules(...)` without going through a
 * function return that widens them to `string`.
 *
 * `OWN_PLUS_DEPT` reuses the `ALL` titles because the toggle (and the
 * active doctor filter) already tell the user what they're looking at —
 * a third heading would be noise.
 */
const HEADING_FOR_MODE = {
  [SCHEDULE_VIEW_MODE.ALL]: {
    title: K.Schedules.allTitle,
    subtitle: K.Schedules.allSubtitle,
  },
  [SCHEDULE_VIEW_MODE.OWN_PLUS_DEPT]: {
    title: K.Schedules.allTitle,
    subtitle: K.Schedules.allSubtitle,
  },
  [SCHEDULE_VIEW_MODE.DEPT]: {
    title: K.Schedules.deptTitle,
    subtitle: K.Schedules.deptSubtitle,
  },
  [SCHEDULE_VIEW_MODE.OWN]: {
    title: K.Schedules.ownTitle,
    subtitle: K.Schedules.ownSubtitle,
  },
} as const satisfies Record<
  ScheduleViewMode,
  { title: string; subtitle: string }
>;

/**
 * Unified, permission-aware F06 schedule page. Replaces the previous
 * `/me/schedule` (DOCTOR) + `/schedules` (NURSE / MRO) split with a single
 * route that dispatches its UI based on the caller's schedule-READ
 * permission codes:
 *
 *  - `schedule.read.all` (MRO)
 *      → `ALL`           : department legend + department filter + every
 *                          schedule across every department. Chips
 *                          colour-coded by department.
 *  - `schedule.read.own-department` + `schedule.read.own` (DOCTOR)
 *      → `OWN_PLUS_DEPT` : "Show mine" / "Show department" toggle. On
 *                          "mine": calendar pinned to caller's doctor
 *                          row. On "dept": doctor filter appears so the
 *                          caller can narrow to a colleague.
 *  - `schedule.read.own-department` ONLY (NURSE)
 *      → `DEPT`          : doctor filter (searchable, infinite-scroll).
 *                          BE auto-narrows to caller's department.
 *  - `schedule.read.own` ONLY (no seeded role today)
 *      → `OWN`           : no filter — BE auto-narrows to caller's
 *                          doctor row.
 *
 * Wire mapping (BE picks the WIDEST scope the caller holds, so the page
 * MUST be explicit about `doctorId` when it wants narrowing tighter than
 * that):
 *
 *  - `ALL`             : pass `departmentId?` from the URL.
 *  - `DEPT`            : pass `doctorId?` from the URL (BE auto-narrows
 *                        to caller's dept regardless).
 *  - `OWN`             : pass nothing (BE auto-narrows to caller's doctor
 *                        since their only scope is `.own`).
 *  - `OWN_PLUS_DEPT` + mine: pass `doctorId=<caller.doctor.id>` so the
 *                            BE narrows past its widest-scope default.
 *  - `OWN_PLUS_DEPT` + dept: pass `doctorId?` from URL (BE auto-narrows
 *                            to caller's dept; explicit `doctorId`
 *                            narrows further).
 *
 * Pagination: requests `pageSize=all` for the schedules call bounded by
 * `from` / `to` (the focused month / week). The date filter caps the row
 * count, which is what makes the `all` sentinel safe here.
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
    departmentId: departmentIdParam,
    doctorId: doctorIdParam,
    scope: scopeParam,
  } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const tSchedules = await getTranslations(NS.Schedules);
  const tErrors = await getTranslations(NS.SchedulesErrors);

  const viewMode = resolveScheduleViewMode(session.user.permissionCodes);

  if (viewMode === null) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.Schedules.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  const isOwnPlusDept = viewMode === SCHEDULE_VIEW_MODE.OWN_PLUS_DEPT;
  // `OWN_PLUS_DEPT` is the only mode where `scope` matters. Other modes
  // collapse to MINE as a harmless default — every per-mode branch below
  // only reads `scope` after checking `viewMode` first anyway.
  const scope = isOwnPlusDept
    ? resolveScope(scopeParam)
    : SCHEDULE_SCOPE.MINE;
  const isMineScope = scope === SCHEDULE_SCOPE.MINE;

  const view = resolveView(rawView);
  const month = parseMonthParam(monthParam);
  const weekStart = parseWeekStartParam(weekStartParam);

  // Month view fetches the WHOLE visible grid (which spills into the prior
  // month's trailing days + the next month's leading days), not just the
  // calendar month. Otherwise schedules on those padding cells never reach
  // the FE and the cells render empty even though rows exist in the DB.
  // Week view's range already matches its rendered span (Mon..Sun).
  const { from, to } =
    view === SCHEDULE_VIEW.MONTH
      ? visibleMonthRangeISO(month)
      : weekRangeISO(weekStart);

  // Read URL filter params per mode — anything irrelevant to the active
  // mode is intentionally dropped so a stale `?doctorId=` from a previous
  // visit can't leak into the BE call for the wrong mode.
  const urlDepartmentId =
    viewMode === SCHEDULE_VIEW_MODE.ALL ? departmentIdParam : undefined;
  const urlDoctorId =
    viewMode === SCHEDULE_VIEW_MODE.DEPT ||
    (isOwnPlusDept && !isMineScope)
      ? doctorIdParam
      : undefined;

  // Scope the doctor filter (and its incremental fetches) to the caller's
  // department so the picker stays useful. Mode `ALL` (MRO) doesn't render
  // the doctor filter, so the BE list narrows to the caller's department
  // for the form dialog's picker only — harmless.
  const doctorFilterScopeDepartmentId =
    viewMode === SCHEDULE_VIEW_MODE.DEPT || isOwnPlusDept
      ? (session.user.departmentId ?? undefined)
      : undefined;

  // `OWN_PLUS_DEPT` + mine needs `caller.doctor.id` to pin the BE query
  // past its widest-scope default — we MUST resolve `/me` before kicking
  // off the schedules fetch in that branch. Other modes don't need `me`
  // at all, so the schedules call can run in parallel with everything
  // else. The wrapper below picks the right concurrency shape per mode
  // so the slow-path (mine) doesn't degrade the fast-path (every other
  // mode) to a sequential round-trip.
  //
  // Compute the effective `doctorId` the BE list call MUST receive:
  //   - `OWN`               : omit (BE auto-narrows to caller).
  //   - `OWN_PLUS_DEPT` mine: pin to caller's doctor id (from /me).
  //   - `OWN_PLUS_DEPT` dept: forward URL-provided filter (or omit).
  //   - `DEPT` (NURSE)      : forward URL-provided filter (or omit).
  //   - `ALL` (MRO)         : omit (department filter is the lever).
  const needsMeBeforeSchedules = isOwnPlusDept && isMineScope;

  async function fetchMeAndSchedules() {
    const me = isOwnPlusDept ? await getMe() : null;
    const queryDoctorId = needsMeBeforeSchedules
      ? me?.doctor?.id
      : urlDoctorId;
    const schedules = await listSchedules({
      pageSize: PAGE_SIZE_ALL,
      from,
      to,
      doctorId: queryDoctorId,
      departmentId: urlDepartmentId,
    });

    return { me, schedules };
  }

  const [{ me, schedules: schedulesResult }, departmentsResult, doctorSeed] =
    await Promise.all([
      fetchMeAndSchedules(),
      listDepartments({ pageSize: MAX_PAGE_SIZE }),
      fetchDoctorPickerSeed({
        departmentId: doctorFilterScopeDepartmentId,
      }),
    ]);

  const ownDoctorId = me?.doctor?.id;

  // Write affordances follow the BE's split CREATE / UPDATE / DELETE
  // codes per scope. The resolver matches the active surface — a DOCTOR
  // viewing `OWN_PLUS_DEPT` + "dept" still sees create/update/delete
  // affordances because they hold `.own` as a fallback; the dialog locks
  // the doctor picker (via `createsLockedToCaller`) so the BE never sees
  // a write for a colleague. The chip-level read-only guard inside
  // `ScheduleFormDialog` re-checks per-row past-time semantics, so
  // `canCreate / canUpdate / canDelete = true` doesn't bypass that.
  const writeCapabilities = resolveScheduleWriteCapabilities(
    viewMode,
    scope,
    session.user.permissionCodes,
  );

  // For modes that effectively pin the calendar to the caller's own
  // doctor row, surface that as `lockedDoctorId` so the dialog disables
  // the doctor picker — a DOCTOR creating a row from this surface cannot
  // accidentally schedule a colleague.
  //
  // `OWN` derives the id from the first schedule row (the BE auto-
  // narrowed the result to the caller's doctor, so any row's `doctorId`
  // is correct). `OWN_PLUS_DEPT` + mine uses `me.doctor.id` directly.
  // `OWN_PLUS_DEPT` + dept with `createsLockedToCaller` (DOCTOR fallback)
  // also pins to `me.doctor.id` — the dialog will lock the picker so the
  // DOCTOR can author their own schedule from the department surface.
  let lockedDoctorId: string | undefined;

  if (viewMode === SCHEDULE_VIEW_MODE.OWN) {
    lockedDoctorId = schedulesResult.data[0]?.doctorId;
  } else if (
    isOwnPlusDept &&
    (isMineScope || writeCapabilities.createsLockedToCaller)
  ) {
    lockedDoctorId = ownDoctorId;
  }

  // Mode `OWN` needs an existing schedule to derive `lockedDoctorId`
  // before the "+ Add" button is meaningful — without it the dialog has
  // no doctor to lock the picker to. Other modes either don't lock the
  // picker or get the id from `/me` directly. CREATE alone consults
  // this; UPDATE / DELETE always have a row (the click handler passes
  // the schedule's own id) so they don't need a separate doctor lookup.
  //
  // The fallback path (`OWN_PLUS_DEPT` + dept with `createsLockedToCaller`)
  // ALSO needs the locked doctor id resolved before create can fire —
  // without it the form has nothing to pre-fill the picker with.
  const needsLockedDoctorId =
    viewMode === SCHEDULE_VIEW_MODE.OWN ||
    (isOwnPlusDept && writeCapabilities.createsLockedToCaller);
  const lockedDoctorIdResolved =
    !needsLockedDoctorId || Boolean(lockedDoctorId);
  const effectiveCanCreate =
    writeCapabilities.canCreate && lockedDoctorIdResolved;
  const effectiveCanUpdate = writeCapabilities.canUpdate;
  const effectiveCanDelete = writeCapabilities.canDelete;

  const colorByDepartment = viewMode === SCHEDULE_VIEW_MODE.ALL;

  const headingCopy = HEADING_FOR_MODE[viewMode];

  // URL-preservation maps — every interactive control that navigates
  // (calendar header, view toggle, filters, scope toggle) drops its own
  // owned params and re-emits whatever else is currently in the URL.
  // `calendarExtraPreserve` is merged INTO ScheduleCalendar's internal
  // preserve map (which already covers `departmentId` + `month` +
  // `weekStart`) so the new params (`doctorId` / `scope`) survive a
  // month-step / view-flip.
  const calendarExtraPreserve: Record<string, string | undefined> = {
    [SCHEDULE_QUERY_PARAM.DOCTOR_ID]: urlDoctorId,
    [SCHEDULE_QUERY_PARAM.SCOPE]: isOwnPlusDept ? scope : undefined,
  };
  const filterPreserve: Record<string, string | undefined> = {
    [SCHEDULE_QUERY_PARAM.VIEW]: view,
    [SCHEDULE_QUERY_PARAM.MONTH]: formatMonthParam(month),
    [SCHEDULE_QUERY_PARAM.WEEK_START]: formatWeekStartParam(weekStart),
  };
  const doctorFilterPreserve: Record<string, string | undefined> = {
    ...filterPreserve,
    [SCHEDULE_QUERY_PARAM.DEPARTMENT_ID]: urlDepartmentId,
    [SCHEDULE_QUERY_PARAM.SCOPE]: isOwnPlusDept ? scope : undefined,
  };
  const scopeTogglePreserve: Record<string, string | undefined> = {
    ...filterPreserve,
    [SCHEDULE_QUERY_PARAM.DOCTOR_ID]: urlDoctorId,
  };

  const showDepartmentFilter = viewMode === SCHEDULE_VIEW_MODE.ALL;
  const showScopeToggle = isOwnPlusDept;
  const showDoctorFilter =
    viewMode === SCHEDULE_VIEW_MODE.DEPT || (isOwnPlusDept && !isMineScope);

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
            {tSchedules(headingCopy.title)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tSchedules(headingCopy.subtitle)}
          </Typography>
        </Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          {showScopeToggle ? (
            <ScheduleViewModeSwitch
              current={scope}
              preserveParams={scopeTogglePreserve}
            />
          ) : null}
          {showDepartmentFilter ? (
            <ScheduleDepartmentFilter
              departments={departmentsResult.data}
              activeDepartmentId={urlDepartmentId ?? null}
              preserveParams={filterPreserve}
            />
          ) : null}
          {showDoctorFilter ? (
            <ScheduleDoctorFilter
              doctorSeed={doctorSeed}
              scopeDepartmentId={doctorFilterScopeDepartmentId}
              activeDoctorId={urlDoctorId ?? null}
              preserveParams={doctorFilterPreserve}
            />
          ) : null}
        </Stack>
      </Stack>
      {colorByDepartment ? (
        <DepartmentLegend departments={departmentsResult.data} />
      ) : null}
      <ScheduleCalendar
        schedules={schedulesResult.data}
        doctorSeed={doctorSeed}
        doctorDepartmentId={doctorFilterScopeDepartmentId}
        departments={departmentsResult.data}
        view={view}
        month={month}
        weekStart={weekStart}
        basePath={FE_PATH.SCHEDULES}
        currentDepartmentId={urlDepartmentId}
        lockedDoctorId={lockedDoctorId}
        createsLockedToCaller={writeCapabilities.createsLockedToCaller}
        callerDoctorId={ownDoctorId}
        canCreate={effectiveCanCreate}
        canUpdate={effectiveCanUpdate}
        canDelete={effectiveCanDelete}
        colorByDepartment={colorByDepartment}
        extraPreserveParams={calendarExtraPreserve}
      />
    </Stack>
  );
}
