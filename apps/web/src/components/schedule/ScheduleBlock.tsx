"use client";

import ButtonBase from "@mui/material/ButtonBase";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useLocale } from "next-intl";

import { dayjs } from "@/lib/dayjs";
import { formatTime, parseISODatetime } from "@/lib/utils/date";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  CALENDAR_ROW_HEIGHT_PX,
  isScheduleReadOnly,
} from "@/schedule/time";
import type { ScheduleResponse } from "@/types/schedule.types";

interface ScheduleBlockProps {
  schedule: ScheduleResponse;
  /** Absolute calendar date of the column hosting this block. */
  columnDate: Date;
  /** Department-keyed background colour. */
  color: string;
  onClick: (schedule: ScheduleResponse) => void;
  /**
   * 0-indexed lane within the day's overlap cluster. Combined with
   * `lanesInCluster` to compute the block's horizontal slot — overlapping
   * schedules render side-by-side instead of stacking on top of each other.
   * Defaults: lane 0, single-lane cluster (full column width).
   */
  lane?: number;
  lanesInCluster?: number;
}

/** Pixel gap kept between adjacent lanes (and the column edges). */
const LANE_GAP_PX = 2;

const MINUTES_PER_HOUR = 60;
const VISIBLE_MINUTES =
  (CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR) * MINUTES_PER_HOUR;

interface ColumnGeometry {
  /** Pixels from the top of the column to the start of the block. */
  top: number;
  /** Block height in pixels (always > 0). */
  height: number;
  /** `true` when the schedule extends past `CALENDAR_DAY_END_HOUR`. */
  clampedBottom: boolean;
  /** `true` when the schedule begins before `CALENDAR_DAY_START_HOUR`. */
  clampedTop: boolean;
}

/**
 * Convert a local `Date` into "minutes since `columnDate` 00:00 local".
 * Returns negative numbers for instants on the previous day so the caller
 * can clamp them to the visible range.
 */
function minutesSinceColumnMidnight(d: Date, columnDate: Date): number {
  const columnMidnight = dayjs(columnDate).startOf("day");

  return dayjs(d).diff(columnMidnight, "minute", true);
}

/**
 * Project a schedule's start / end into pixel offsets within a column
 * that renders `CALENDAR_DAY_START_HOUR..CALENDAR_DAY_END_HOUR`. Clamps
 * to the visible range and reports each clamp so the caller can render
 * an indicator (a small triangle on the clamped edge).
 */
function computeColumnGeometry(
  schedule: ScheduleResponse,
  columnDate: Date,
): ColumnGeometry | null {
  const startDate = parseISODatetime(schedule.startAt);
  const endDate = parseISODatetime(schedule.endAt);

  if (!startDate || !endDate) {
    return null;
  }

  const startMin =
    minutesSinceColumnMidnight(startDate, columnDate) -
    CALENDAR_DAY_START_HOUR * MINUTES_PER_HOUR;
  const endMin =
    minutesSinceColumnMidnight(endDate, columnDate) -
    CALENDAR_DAY_START_HOUR * MINUTES_PER_HOUR;

  const clampedTop = startMin < 0;
  const clampedBottom = endMin > VISIBLE_MINUTES;

  const clampedStart = Math.max(0, startMin);
  const clampedEnd = Math.min(VISIBLE_MINUTES, endMin);

  if (clampedEnd <= clampedStart) {
    return null;
  }

  const pxPerMinute = CALENDAR_ROW_HEIGHT_PX / MINUTES_PER_HOUR;

  return {
    top: clampedStart * pxPerMinute,
    height: (clampedEnd - clampedStart) * pxPerMinute,
    clampedTop,
    clampedBottom,
  };
}

/**
 * Pixel-positioned schedule block rendered inside a week-view day column.
 * The hosting column passes the column's date so we can project the ISO
 * datetimes into pixel offsets correctly even when the column straddles
 * a DST boundary (the math is in local-time minutes-since-midnight, which
 * the browser already handles).
 *
 * Renders the break window as a hatched overlay so callers can see where
 * the doctor is unavailable inside the block without opening the modal.
 */
export default function ScheduleBlock({
  schedule,
  columnDate,
  color,
  onClick,
  lane = 0,
  lanesInCluster = 1,
}: ScheduleBlockProps) {
  const locale = useLocale();
  const geometry = computeColumnGeometry(schedule, columnDate);

  if (!geometry) {
    return null;
  }

  const startDate = parseISODatetime(schedule.startAt);
  const endDate = parseISODatetime(schedule.endAt);
  const breakStartDate = schedule.breakStartAt
    ? parseISODatetime(schedule.breakStartAt)
    : null;
  const breakEndDate = schedule.breakEndAt
    ? parseISODatetime(schedule.breakEndAt)
    : null;

  const timeRange =
    startDate && endDate
      ? `${formatTime(startDate, locale)}–${formatTime(endDate, locale)}`
      : "";

  const doctorName = `${schedule.doctor.firstNameEn} ${schedule.doctor.lastNameEn}`;

  // Break overlay — only render when both ends fall inside the block.
  let breakGeometry: { top: number; height: number } | null = null;

  if (breakStartDate && breakEndDate) {
    const breakStartMin =
      minutesSinceColumnMidnight(breakStartDate, columnDate) -
      CALENDAR_DAY_START_HOUR * MINUTES_PER_HOUR;
    const breakEndMin =
      minutesSinceColumnMidnight(breakEndDate, columnDate) -
      CALENDAR_DAY_START_HOUR * MINUTES_PER_HOUR;

    const clampedStart = Math.max(0, breakStartMin);
    const clampedEnd = Math.min(VISIBLE_MINUTES, breakEndMin);

    if (clampedEnd > clampedStart) {
      const pxPerMinute = CALENDAR_ROW_HEIGHT_PX / MINUTES_PER_HOUR;
      const breakTop = clampedStart * pxPerMinute - geometry.top;
      const breakHeight = (clampedEnd - clampedStart) * pxPerMinute;

      if (breakHeight > 0 && breakTop >= 0 && breakTop < geometry.height) {
        breakGeometry = { top: breakTop, height: breakHeight };
      }
    }
  }

  // Lane-based horizontal positioning. A single-lane block uses the full
  // column width (minus a 4px inset for visual padding). Multi-lane blocks
  // split the column into equal slots with a 2px gap between them so the
  // colored edges of adjacent blocks remain visible.
  const totalLanes = Math.max(1, lanesInCluster);
  const slotIndex = Math.min(Math.max(lane, 0), totalLanes - 1);
  const widthPct = 100 / totalLanes;
  const leftPct = slotIndex * widthPct;

  // Past blocks dim slightly so the user can scan "already happened"
  // separately from "upcoming". The closed-to-bookings 0.55 dim stays
  // stronger so the two states remain distinguishable.
  const isPast = isScheduleReadOnly(schedule);
  const opacity = !schedule.acceptsBooking ? 0.55 : isPast ? 0.7 : 0.95;

  return (
    <ButtonBase
      onClick={(event) => {
        event.stopPropagation();
        onClick(schedule);
      }}
      sx={{
        position: "absolute",
        top: geometry.top,
        left: `calc(${leftPct}% + ${slotIndex === 0 ? 4 : LANE_GAP_PX}px)`,
        width: `calc(${widthPct}% - ${
          slotIndex === 0 || slotIndex === totalLanes - 1
            ? 4 + LANE_GAP_PX
            : LANE_GAP_PX * 2
        }px)`,
        height: geometry.height,
        bgcolor: color,
        color: "primary.contrastText",
        borderRadius: 1,
        textAlign: "left",
        justifyContent: "flex-start",
        alignItems: "flex-start",
        px: 0.75,
        py: 0.5,
        opacity,
        overflow: "hidden",
        boxShadow: 1,
        "&:hover": {
          opacity: 1,
          boxShadow: 2,
          zIndex: 2,
        },
      }}
      aria-label={`${timeRange} ${doctorName} ${schedule.department.name}`}
    >
      <Stack
        spacing={0.25}
        sx={{
          width: "100%",
          height: "100%",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box
          component="span"
          sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2 }}
        >
          {timeRange}
          {geometry.clampedTop ? " ▲" : ""}
          {geometry.clampedBottom ? " ▼" : ""}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}
        >
          {doctorName}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 10,
            lineHeight: 1.2,
            opacity: 0.85,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}
        >
          {schedule.department.name}
        </Box>
      </Stack>

      {breakGeometry ? (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            top: breakGeometry.top,
            height: breakGeometry.height,
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0 4px, transparent 4px 8px)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      ) : null}
    </ButtonBase>
  );
}
