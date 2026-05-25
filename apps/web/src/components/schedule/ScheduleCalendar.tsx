"use client";

import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
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
import { parseISODatetime, toISODateLocal } from "@/lib/utils/date";
import { formatMonthParam, isInMonth, type MonthParam } from "@/schedule/month";
import { CALENDAR_DAY_END_HOUR } from "@/schedule/time";
import {
  buildWeekDays,
  formatWeekStartParam,
} from "@/schedule/week";
import type { DepartmentRow } from "@/types/department.types";
import type { DoctorListRow } from "@/types/doctor.types";
import type { ScheduleResponse } from "@/types/schedule.types";

interface ScheduleCalendarProps {
  schedules: readonly ScheduleResponse[];
  /**
   * First page of doctors (SSR-fetched). Subsequent pages load
   * incrementally from inside the form dialog as the user scrolls the
   * doctor picker — see `ScheduleFormDialog` for the cursor logic.
   */
  doctors: readonly DoctorListRow[];
  /**
   * Total doctor count behind the current filter — drives the
   * "Showing X of Y" footer hint and the `hasMore` flag in the form
   * dialog's incremental loader.
   */
  doctorsTotal: number;
  /**
   * Page number the SSR `doctors` payload corresponds to. Passed through
   * to the dialog so the next incremental fetch knows which page to ask
   * for. Always `1` today; the prop exists so the contract stays
   * future-proof when other callers reach this component.
   */
  initialDoctorPage: number;
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
   * Permission gate — when `false` the calendar renders read-only (no
   * click-to-create on empty cells, no chip click handler, no delete).
   */
  canManage: boolean;
}

/**
 * Visually-distinct department palette. Colours are picked so adjacent
 * entries don't collide on hue, and so the set covers ≥ the seeded
 * department count (10) without modulo wrap-around. Each entry is a
 * literal hex tuned for AA contrast against the chip swatch background
 * rather than an MUI palette token, because palette tokens are sparse
 * (primary/secondary/success/warning/error/info × main/dark) and that
 * is what caused 3-way collisions in the previous version.
 */
const DEPARTMENT_COLOR_PALETTE: readonly string[] = [
  "#1976d2", // blue 700
  "#388e3c", // green 700
  "#f57c00", // orange 700
  "#d32f2f", // red 700
  "#7b1fa2", // purple 700
  "#0097a7", // cyan 700
  "#c2185b", // pink 700
  "#5d4037", // brown 700
  "#455a64", // blue grey 700
  "#fbc02d", // yellow 700
  "#7cb342", // light green 600
  "#5c6bc0", // indigo 400
];

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
  doctors,
  doctorsTotal,
  initialDoctorPage,
  doctorDepartmentId,
  departments,
  view,
  month,
  weekStart,
  basePath,
  currentDepartmentId,
  lockedDoctorId,
  canManage,
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

  // Position-indexed (not hash-indexed) so two adjacent departments never
  // share a swatch when the palette has more entries than departments.
  // `departments` is the FULL list passed to the calendar (already sorted
  // by name from the server page), so colour assignment stays stable
  // across renders for any given department id.
  const colorForDepartment = useCallback(
    (departmentId: string): string => {
      const index = departments.findIndex((d) => d.id === departmentId);
      const safe = index >= 0 ? index : 0;

      return (
        DEPARTMENT_COLOR_PALETTE[safe % DEPARTMENT_COLOR_PALETTE.length] ??
        DEPARTMENT_COLOR_PALETTE[0]!
      );
    },
    [departments],
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
  const preserveForHeader: Record<string, string | undefined> = {
    [SCHEDULE_QUERY_PARAM.DEPARTMENT_ID]: currentDepartmentId,
    // Keep BOTH date params so flipping views later doesn't lose state.
    [SCHEDULE_QUERY_PARAM.MONTH]: formatMonthParam(month),
    [SCHEDULE_QUERY_PARAM.WEEK_START]: formatWeekStartParam(weekStart),
  };

  // For the view toggle we drop the date param that DOESN'T match the
  // *target* view — but since we don't know the target until click time,
  // forward both and let the URL keep them. The week / month parsers
  // default gracefully when their param is missing.
  const preserveForToggle: Record<string, string | undefined> = {
    [SCHEDULE_QUERY_PARAM.DEPARTMENT_ID]: currentDepartmentId,
    [SCHEDULE_QUERY_PARAM.MONTH]: formatMonthParam(month),
    [SCHEDULE_QUERY_PARAM.WEEK_START]: formatWeekStartParam(weekStart),
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

          {canManage ? (
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

        {/* Row 2 — full-width department legend, sourced from the FULL
            department list (not just departments with schedules in view)
            so the legend stays informative even when the focused range
            is empty. */}
        {departments.length > 1 ? (
          <Stack
            direction="row"
            alignItems="center"
            flexWrap="wrap"
            rowGap={0.5}
            columnGap={1.5}
            sx={{
              px: 1,
              py: 0.5,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              bgcolor: "background.paper",
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mr: 0.5 }}
            >
              {tSchedules(K.Schedules.legendDepartment)}
            </Typography>
            {departments.map((dept) => (
              <Stack
                key={dept.id}
                direction="row"
                alignItems="center"
                spacing={0.75}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: 0.5,
                    bgcolor: colorForDepartment(dept.id),
                    flexShrink: 0,
                  }}
                />
                <Typography variant="caption" sx={{ lineHeight: 1 }}>
                  {dept.name}
                </Typography>
              </Stack>
            ))}
          </Stack>
        ) : null}
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
            onScheduleClick={canManage ? openEdit : () => undefined}
          />
        ) : (
          <ScheduleWeekView
            schedules={focusedSchedules}
            weekStart={weekStart}
            colorForDepartment={colorForDepartment}
            onDateSelect={handleWeekDateSelect}
            onScheduleClick={canManage ? openEdit : () => undefined}
          />
        )}
      </Box>

      {/* Mobile chronological list — xs / sm only */}
      <Box sx={{ display: { xs: "block", md: "none" } }}>
        <ScheduleDayMobileList
          schedules={focusedSchedules}
          colorForDepartment={colorForDepartment}
          canCreate={canManage}
          onCreateForDate={handleMobileCreateForDate}
          onScheduleClick={canManage ? openEdit : () => undefined}
        />
      </Box>

      <ScheduleFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        doctors={doctors}
        doctorsTotal={doctorsTotal}
        initialDoctorPage={initialDoctorPage}
        doctorDepartmentId={doctorDepartmentId}
        lockedDoctorId={lockedDoctorId}
        editing={editing}
        prefill={prefill}
      />

      <ScheduleDayDetailsDialog
        open={dayDetails !== null}
        date={dayDetails?.date ?? null}
        schedules={dayDetailsSchedules}
        canManage={canManage}
        colorForDepartment={colorForDepartment}
        onClose={() => setDayDetails(null)}
        onCreate={handleDayDetailsCreate}
        onEditSchedule={handleDayDetailsEdit}
      />
    </Box>
  );
}
