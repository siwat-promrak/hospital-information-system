"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLocale } from "next-intl";
import { useMemo, type MouseEvent } from "react";

import ScheduleBlock from "@/components/schedule/ScheduleBlock";
import { dayjs } from "@/lib/dayjs";
import {
  isSameLocalDate,
  parseISODatetime,
  toISODateLocal,
} from "@/lib/utils/date";
import { assignLanesForDay } from "@/schedule/lanes";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  CALENDAR_ROW_HEIGHT_PX,
} from "@/schedule/time";
import { buildWeekDays } from "@/schedule/week";
import type { ScheduleResponse } from "@/types/schedule.types";

interface ScheduleWeekViewProps {
  schedules: readonly ScheduleResponse[];
  weekStart: Date;
  colorForDepartment: (departmentId: string) => string;
  /**
   * Fired when the user clicks an empty area of a day column. The hour
   * is snapped to the clicked row (e.g. clicking 10:30 → `hour = 10`)
   * so the host can pre-fill the modal start time at that hour when the
   * user chooses to Create from the day-details dialog.
   */
  onDateSelect: (cellDate: Date, hour: number) => void;
  onScheduleClick: (schedule: ScheduleResponse) => void;
}

const TIME_GUTTER_WIDTH_PX = 64;

/**
 * Pixel-positioned week grid. 7 day columns from Mon..Sun (`weekStart`
 * is the ISO Monday) with one row per hour from
 * `CALENDAR_DAY_START_HOUR..CALENDAR_DAY_END_HOUR`. Schedules render as
 * absolutely-positioned `<ScheduleBlock>` children inside their day
 * column.
 *
 * Click an empty area of a column → host opens the day-details dialog
 * for that date (with the clicked hour remembered so Create-schedule
 * pre-fills the modal start time). Click a block → edit modal.
 *
 * Days outside the visible hour range overflow the column with up/down
 * indicators on the block itself (see `ScheduleBlock`'s clamp logic).
 */
export default function ScheduleWeekView({
  schedules,
  weekStart,
  colorForDepartment,
  onDateSelect,
  onScheduleClick,
}: ScheduleWeekViewProps) {
  const locale = useLocale();

  const days = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const today = useMemo(() => new Date(), []);

  const hourRows = useMemo(() => {
    const rows: number[] = [];

    for (let h = CALENDAR_DAY_START_HOUR; h < CALENDAR_DAY_END_HOUR; h += 1) {
      rows.push(h);
    }

    return rows;
  }, []);

  const totalHeight =
    (CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR) *
    CALENDAR_ROW_HEIGHT_PX;

  // Bucket schedules by local-date `YYYY-MM-DD` so each column only
  // iterates its own rows.
  const schedulesByDate = useMemo(() => {
    const map = new Map<string, ScheduleResponse[]>();

    for (const schedule of schedules) {
      const start = parseISODatetime(schedule.startAt);

      if (!start) {
        continue;
      }

      const key = toISODateLocal(start);
      const bucket = map.get(key) ?? [];
      bucket.push(schedule);
      map.set(key, bucket);
    }

    return map;
  }, [schedules]);

  // Per-day lane assignment so overlapping schedules render side-by-side
  // instead of stacking on top of each other.
  const lanesByDate = useMemo(() => {
    const map = new Map<string, ReturnType<typeof assignLanesForDay>>();

    for (const [key, list] of schedulesByDate) {
      map.set(key, assignLanesForDay(list));
    }

    return map;
  }, [schedulesByDate]);

  const formatDayHeader = useMemo(
    () => (date: Date) => dayjs(date).locale(locale).format("ddd D"),
    [locale],
  );

  const formatHourLabel = useMemo(
    () => (hour: number) =>
      dayjs().locale(locale).hour(hour).minute(0).format("HH:mm"),
    [locale],
  );

  function dayKey(date: Date): string {
    return toISODateLocal(date);
  }

  function handleColumnClick(
    event: MouseEvent<HTMLDivElement>,
    columnDate: Date,
  ) {
    // Translate the click's offset within the column into an hour by
    // dividing by the row height — host remembers it so the create
    // modal pre-fills start time at that hour.
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const hourIndex = Math.floor(offsetY / CALENDAR_ROW_HEIGHT_PX);
    const hour = CALENDAR_DAY_START_HOUR + Math.max(0, hourIndex);

    onDateSelect(columnDate, Math.min(hour, CALENDAR_DAY_END_HOUR - 1));
  }

  return (
    // `overflow: "visible"` MUST stay — MUI's `Card` root ships with
    // `overflow: "hidden"` baked into its styled root class (see
    // `@mui/material/Card/Card.js`), and that clipping context silently
    // breaks `position: sticky` on the day-header Box below. The sticky
    // element's scroll container is the `<Box overflowY="auto">` in
    // `ScheduleCalendar.tsx`; an intermediate ancestor with
    // `overflow: hidden` would clip the sticky header inside the Card.
    <Card variant="outlined" sx={{ overflow: "visible" }}>
      {/* Header row: empty gutter cell + one cell per day. Sticks to the
          calendar scroll container above so the day-of-week labels stay
          visible while the hour rows scroll underneath. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `${TIME_GUTTER_WIDTH_PX}px repeat(7, 1fr)`,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          position: "sticky",
          top: 0,
          zIndex: 2,
        }}
      >
        <Box sx={{ p: 1 }} />
        {days.map((day) => {
          const isToday = isSameLocalDate(day, today);

          return (
            <Box
              key={dayKey(day)}
              sx={{
                p: 1,
                textAlign: "center",
                borderLeft: 1,
                borderColor: "divider",
                bgcolor: isToday ? "primary.light" : undefined,
                color: isToday ? "primary.contrastText" : undefined,
              }}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                {formatDayHeader(day)}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Body: gutter with hour labels + 7 day columns */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `${TIME_GUTTER_WIDTH_PX}px repeat(7, 1fr)`,
          position: "relative",
        }}
      >
        {/* Gutter — hour labels */}
        <Stack sx={{ position: "relative", height: totalHeight }}>
          {hourRows.map((hour, idx) => (
            <Box
              key={hour}
              sx={{
                position: "absolute",
                top: idx * CALENDAR_ROW_HEIGHT_PX,
                left: 0,
                right: 0,
                pr: 1,
                textAlign: "right",
                color: "text.secondary",
                fontSize: 11,
                transform: "translateY(-50%)",
              }}
            >
              {formatHourLabel(hour)}
            </Box>
          ))}
        </Stack>

        {/* Day columns */}
        {days.map((day) => {
          const isToday = isSameLocalDate(day, today);
          const dayBlocks = schedulesByDate.get(dayKey(day)) ?? [];
          const dayLanes = lanesByDate.get(dayKey(day));

          return (
            <Box
              key={dayKey(day)}
              onClick={(event) => handleColumnClick(event, day)}
              sx={{
                position: "relative",
                height: totalHeight,
                borderLeft: 1,
                borderColor: "divider",
                cursor: "pointer",
                bgcolor: isToday ? "action.hover" : "background.paper",
                "&:hover": { bgcolor: "action.selected" },
              }}
            >
              {/* Hour grid lines */}
              {hourRows.map((hour, idx) => (
                <Box
                  key={hour}
                  aria-hidden
                  sx={{
                    position: "absolute",
                    top: idx * CALENDAR_ROW_HEIGHT_PX,
                    left: 0,
                    right: 0,
                    height: 0,
                    borderTop: 1,
                    borderStyle: "dashed",
                    borderColor: "divider",
                    pointerEvents: "none",
                  }}
                />
              ))}

              {dayBlocks.map((schedule) => {
                const assignment = dayLanes?.get(schedule.id);

                return (
                  <ScheduleBlock
                    key={schedule.id}
                    schedule={schedule}
                    columnDate={day}
                    color={colorForDepartment(schedule.departmentId)}
                    onClick={onScheduleClick}
                    lane={assignment?.lane ?? 0}
                    lanesInCluster={assignment?.lanesInCluster ?? 1}
                  />
                );
              })}
            </Box>
          );
        })}
      </Box>
    </Card>
  );
}
