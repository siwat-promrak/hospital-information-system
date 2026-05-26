"use client";

import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import ScheduleDayDetailsDialog from "@/components/schedule/ScheduleDayDetailsDialog";
import ScheduleDayMobileList from "@/components/schedule/ScheduleDayMobileList";
import ScheduleFormDialog, {
  type ScheduleFormDialogPrefill,
} from "@/components/schedule/ScheduleFormDialog";
import ScheduleHeaderNav from "@/components/schedule/ScheduleHeaderNav";
import ScheduleMonthView from "@/components/schedule/ScheduleMonthView";
import ScheduleViewToggle from "@/components/schedule/ScheduleViewToggle";
import ScheduleWeekView from "@/components/schedule/ScheduleWeekView";
import { K, NS } from "@/i18n/keys.generated";
import {
  SCHEDULE_QUERY_PARAM,
  SCHEDULE_VIEW,
  type ScheduleView,
} from "@/lib/api/schedule.const";
import { makeDepartmentColorResolver } from "@/schedule/department-palette";
import { parseISODatetime, toISODateLocal } from "@/lib/utils/date";
import { formatMonthParam, isInMonth, type MonthParam } from "@/schedule/month";
import { CALENDAR_DAY_END_HOUR } from "@/schedule/time";
import {
  buildWeekDays,
  formatWeekStartParam,
} from "@/schedule/week";
import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import type { DepartmentRow } from "@/types/department.types";
import type { DoctorListRow } from "@/types/doctor.types";
import type { ScheduleResponse } from "@/types/schedule.types";

interface ScheduleCalendarProps {
  schedules: readonly ScheduleResponse[];
  /**
   * Page-1 SSR seed for the doctor picker inside `ScheduleFormDialog`.
   * Subsequent pages stream in via `<DoctorSelect>` (which wraps
   * `usePaginatedList`) as the user scrolls the dropdown.
   */
  doctorSeed: PaginatedListInitial<DoctorListRow>;
  /**
   * Department filter forwarded to the dialog's incremental doctor
   * fetcher so the paged results stay scoped to the same subset SSR
   * used. Same as `currentDepartmentId` for the staff view; left
   * `undefined` for the doctor self-edit view.
   */
  doctorDepartmentId?: string;
  /**
   * Departments visible across the user's permission scope — used to seed
   * the colour legend so all the chip colours are explainable even when
   * the active filter narrows the visible schedules.
   */
  departments: readonly DepartmentRow[];
  /** Active view (`month` or `week`), parsed from `?view=`. */
  view: ScheduleView;
  /** The month being shown, parsed from `?month=YYYY-MM`. */
  month: MonthParam;
  /** Monday of the week being shown, parsed from `?weekStart=YYYY-MM-DD`. */
  weekStart: Date;
  /** Locale-aware base URL for the page — used by prev / today / next links. */
  basePath: string;
  /**
   * When set, the create modal pre-fills `departmentId` and the calendar
   * legend can hide departments that have no schedules in view. Preserved
   * across navigation via the query string.
   */
  currentDepartmentId?: string;
  /**
   * When set, the doctor field in the modal is fixed (DOCTOR's own
   * schedule view).
   */
  lockedDoctorId?: string;
  /**
   * `true` when the caller's effective write scope is narrower than the
   * visible surface (DOCTOR viewing `OWN_PLUS_DEPT` + "dept" with only
   * `.own` codes). The create dialog locks the doctor picker to the
   * caller. Per-row Update / Delete buttons hide when the row isn't the
   * caller's own.
   */
  createsLockedToCaller: boolean;
  /**
   * The caller's own `Doctor.id`, when resolvable from `/me`. Needed to
   * narrow per-row write affordances under `createsLockedToCaller` —
   * a chip whose `doctorId !== callerDoctorId` becomes read-only in the
   * edit dialog so the DOCTOR can only update / delete their own rows.
   */
  callerDoctorId?: string;
  /**
   * Per-action permission gates derived in the page from the active
   * `(viewMode, scope)` pair. A DOCTOR viewing `OWN_PLUS_DEPT` + "dept"
   * still sees `true` because they hold `.own` as a fallback — the per-row
   * narrowing happens inside `ScheduleFormDialog` via `createsLockedToCaller`
   * + `callerDoctorId`.
   *
   * Each affordance gates on the matching verb so a future role with
   * (say) only `schedule.create.*` still gets the "+ Add" button without
   * the chip-edit / delete buttons appearing.
   */
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /**
   * When `true`, every schedule chip is colour-coded by its
   * `departmentId` using the shared department palette. When `false`,
   * chips fall back to a single neutral colour (the MUI primary). The
   * unified `/schedules` page only enables this in mode `"all"` (MRO),
   * where surfacing the department from the chip itself is the only way
   * to disambiguate doctors from different specialties on the same day.
   */
  colorByDepartment: boolean;
  /**
   * Extra URL params the calendar header (prev / today / next) AND the
   * view toggle should preserve on navigation. Merged into the
   * calendar's own internal preserve map. Used by the unified
   * `/schedules` page to keep `doctorId` / `scope` in the URL when the
   * user steps through months / flips view mode.
   */
  extraPreserveParams?: Readonly<Record<string, string | undefined>>;
}

/**
 * Single chip colour used when `colorByDepartment === false`. Drawn from
 * the MUI palette so the rest of the calendar (today indicator, hover
 * accents) stays harmonised. `#1976d2` matches `primary.main` in the
 * default MUI palette and the first slot of the department palette, so
 * the visual identity stays consistent across modes.
 */
const SINGLE_CHIP_COLOR = "#1976d2";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Top-level F06 schedule calendar. Owns:
 *  - the view toggle (month / week),
 *  - the prev / today / next header navigation,
 *  - the create / edit modal state,
 *  - the mobile fallback (chronological grouped list).
 *
 * Renders `<ScheduleMonthView>` or `<ScheduleWeekView>` based on `view`.
 * The mobile fallback is the same chronological list in both views — the
 * data set is bounded by the page's `from` / `to` filter so the list only
 * shows the currently focused window.
 */
export default function ScheduleCalendar({
  schedules,
  doctorSeed,
  doctorDepartmentId,
  departments,
  view,
  month,
  weekStart,
  basePath,
  currentDepartmentId,
  lockedDoctorId,
  createsLockedToCaller,
  callerDoctorId,
  canCreate,
  canUpdate,
  canDelete,
  colorByDepartment,
  extraPreserveParams,
}: ScheduleCalendarProps) {
  const tSchedules = useTranslations(NS.Schedules);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleResponse | null>(null);
  const [prefill, setPrefill] = useState<ScheduleFormDialogPrefill | undefined>(
    undefined,
  );
  const [dayDetails, setDayDetails] = useState<{
    date: Date;
    /** Optional hour the user clicked in week view — pre-fills the create modal. */
    hour: number | null;
  } | null>(null);

  // Department-palette resolver shared with the legend (see
  // `makeDepartmentColorResolver`). When `colorByDepartment === false`,
  // every chip falls back to the single neutral colour so the calendar
  // does NOT visually pretend departments are meaningful in modes where
  // the rendered set is already narrowed to one department / one doctor.
  const resolveDeptColor = useMemo(
    () => makeDepartmentColorResolver(departments),
    [departments],
  );
  const colorForDepartment = useCallback(
    (departmentId: string): string => {
      if (!colorByDepartment) {
        return SINGLE_CHIP_COLOR;
      }

      return resolveDeptColor(departmentId);
    },
    [resolveDeptColor, colorByDepartment],
  );

  // The set of schedules that fall inside the focused range. Month view
  // wants in-month schedules; week view wants in-week schedules. We do the
  // narrowing here so the empty-state, mobile list, and view children stay
  // in lock-step.
  const focusedSchedules = useMemo(() => {
    if (view === SCHEDULE_VIEW.MONTH) {
      return schedules.filter((s) => {
        const start = parseISODatetime(s.startAt);

        if (!start) {
          return false;
        }

        return isInMonth(start, month);
      });
    }

    const weekDays = buildWeekDays(weekStart);
    const weekKeys = new Set(weekDays.map((d) => toISODateLocal(d)));

    return schedules.filter((s) => {
      const start = parseISODatetime(s.startAt);

      if (!start) {
        return false;
      }

      return weekKeys.has(toISODateLocal(start));
    });
  }, [schedules, view, month, weekStart]);

  const dayDetailsSchedules = useMemo(() => {
    if (!dayDetails) {
      return [];
    }

    const key = toISODateLocal(dayDetails.date);

    return schedules.filter((s) => {
      const start = parseISODatetime(s.startAt);

      if (!start) {
        return false;
      }

      return toISODateLocal(start) === key;
    });
  }, [schedules, dayDetails]);

  function openCreate(prefillValue: ScheduleFormDialogPrefill | undefined) {
    setEditing(null);
    setPrefill(prefillValue);
    setDialogOpen(true);
  }

  function openEdit(schedule: ScheduleResponse) {
    setEditing(schedule);
    setPrefill(undefined);
    setDialogOpen(true);
  }

  function handleMonthDateSelect(cellDate: Date) {
    setDayDetails({ date: cellDate, hour: null });
  }

  function handleWeekDateSelect(cellDate: Date, hour: number) {
    setDayDetails({ date: cellDate, hour });
  }

  function handleDayDetailsCreate(date: Date) {
    const hour = dayDetails?.hour ?? null;
    setDayDetails(null);

    // `lockDate: true` — the user already chose the day in the
    // day-details dialog that opened this create modal. Disabling the
    // date input there prevents a silent off-by-one ("clicked May 26 but
    // ended up on May 27") on submit.
    if (hour === null) {
      openCreate({
        date: toISODateLocal(date),
        departmentId: currentDepartmentId,
        lockDate: true,
      });

      return;
    }

    const startHour = Math.min(hour, CALENDAR_DAY_END_HOUR - 1);
    const endHour = Math.min(startHour + 1, CALENDAR_DAY_END_HOUR);

    openCreate({
      date: toISODateLocal(date),
      startTime: `${pad2(startHour)}:00`,
      endTime: `${pad2(endHour)}:00`,
      departmentId: currentDepartmentId,
      lockDate: true,
    });
  }

  function handleDayDetailsEdit(schedule: ScheduleResponse) {
    setDayDetails(null);
    openEdit(schedule);
  }

  function handleAddButtonClick() {
    // Mobile + desktop "+ Add" — defaults to today.
    openCreate({
      date: toISODateLocal(new Date()),
      departmentId: currentDepartmentId,
    });
  }

  function handleMobileCreateForDate(date: Date) {
    openCreate({
      date: toISODateLocal(date),
      departmentId: currentDepartmentId,
    });
  }

  // Param-preservation map for the header + view-toggle. Each one strips
  // the params it owns (the toggle owns `view`; the header owns the date
  // params) and keeps everything else.
  //
  // `extraPreserveParams` lets the unified page inject the new URL state
  // (`doctorId`, `scope`) the calendar doesn't otherwise know about — the
  // calendar's own props pre-date the consolidation and only carry
  // `currentDepartmentId`. Merging both ensures every param survives a
  // month-step / view-flip.
  const preserveForHeader: Record<string, string | undefined> = {
    [SCHEDULE_QUERY_PARAM.DEPARTMENT_ID]: currentDepartmentId,
    // Keep BOTH date params so flipping views later doesn't lose state.
    [SCHEDULE_QUERY_PARAM.MONTH]: formatMonthParam(month),
    [SCHEDULE_QUERY_PARAM.WEEK_START]: formatWeekStartParam(weekStart),
    ...(extraPreserveParams ?? {}),
  };

  // For the view toggle we drop the date param that DOESN'T match the
  // *target* view — but since we don't know the target until click time,
  // forward both and let the URL keep them. The week / month parsers
  // default gracefully when their param is missing.
  const preserveForToggle: Record<string, string | undefined> = {
    [SCHEDULE_QUERY_PARAM.DEPARTMENT_ID]: currentDepartmentId,
    [SCHEDULE_QUERY_PARAM.MONTH]: formatMonthParam(month),
    [SCHEDULE_QUERY_PARAM.WEEK_START]: formatWeekStartParam(weekStart),
    ...(extraPreserveParams ?? {}),
  };

  return (
    <Box>
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {/* Row 1 — nav + view toggle on the left, Add button pinned right. */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", md: "center" }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "stretch", sm: "center" }}
          >
            <ScheduleHeaderNav
              view={view}
              month={month}
              weekStart={weekStart}
              basePath={basePath}
              preserveParams={preserveForHeader}
            />
            <ScheduleViewToggle
              view={view}
              basePath={basePath}
              preserveParams={preserveForToggle}
            />
          </Stack>

          {canCreate ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddButtonClick}
              sx={{ alignSelf: { xs: "stretch", md: "center" } }}
            >
              {tSchedules(K.Schedules.addSchedule)}
            </Button>
          ) : null}
        </Stack>
      </Stack>

      {/* Desktop / tablet — md+ — actual calendar grid.
          The grid scrolls INSIDE this container (especially relevant for
          the 1440px-tall week view) so the page header, filter, legend,
          view toggle, and "Add schedule" button above stay anchored
          while the user scrolls late-evening hours of the calendar.
          `100dvh` (dynamic viewport height) keeps the mobile address-bar
          collapse from yanking the layout. The offset constants are
          tuned for the `(app)` shell chrome + this calendar's own header
          row — a smaller offset means more visible calendar. */}
      <Box
        sx={{
          display: { xs: "none", md: "block" },
          overflowY: "auto",
          overflowX: "hidden",
          maxHeight: { md: "calc(100dvh - 240px)" },
        }}
      >
        {view === SCHEDULE_VIEW.MONTH ? (
          <ScheduleMonthView
            schedules={schedules}
            month={month}
            colorForDepartment={colorForDepartment}
            onDateSelect={handleMonthDateSelect}
            onScheduleClick={canUpdate ? openEdit : () => undefined}
          />
        ) : (
          <ScheduleWeekView
            schedules={focusedSchedules}
            weekStart={weekStart}
            colorForDepartment={colorForDepartment}
            onDateSelect={handleWeekDateSelect}
            onScheduleClick={canUpdate ? openEdit : () => undefined}
          />
        )}
      </Box>

      {/* Mobile chronological list — xs / sm only */}
      <Box sx={{ display: { xs: "block", md: "none" } }}>
        <ScheduleDayMobileList
          schedules={focusedSchedules}
          colorForDepartment={colorForDepartment}
          canCreate={canCreate}
          onCreateForDate={handleMobileCreateForDate}
          onScheduleClick={canUpdate ? openEdit : () => undefined}
        />
      </Box>

      <ScheduleFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        doctorSeed={doctorSeed}
        doctorDepartmentId={doctorDepartmentId}
        lockedDoctorId={lockedDoctorId}
        createsLockedToCaller={createsLockedToCaller}
        callerDoctorId={callerDoctorId}
        canDelete={canDelete}
        editing={editing}
        prefill={prefill}
      />

      <ScheduleDayDetailsDialog
        open={dayDetails !== null}
        date={dayDetails?.date ?? null}
        schedules={dayDetailsSchedules}
        canCreate={canCreate}
        canUpdate={canUpdate}
        colorForDepartment={colorForDepartment}
        onClose={() => setDayDetails(null)}
        onCreate={handleDayDetailsCreate}
        onEditSchedule={handleDayDetailsEdit}
      />
    </Box>
  );
}
