"use client";

import ButtonBase from "@mui/material/ButtonBase";
import Box from "@mui/material/Box";
import { useLocale } from "next-intl";

import { formatTime, parseISODatetime } from "@/lib/utils/date";
import { isScheduleReadOnly } from "@/schedule/time";
import type { ScheduleResponse } from "@/types/schedule.types";

interface ScheduleChipProps {
  schedule: ScheduleResponse;
  color: string;
  onClick: (schedule: ScheduleResponse) => void;
}

/**
 * Single calendar chip rendered inside a month-grid date cell. Shows the
 * schedule's start time + doctor's last name + department name, with a
 * coloured dot keyed off `departmentId`. Clicking opens the edit modal
 * (the calendar swallows the click via `stopPropagation` so the day-cell
 * create-handler does NOT also fire).
 *
 * Dimmed when `acceptsBooking === false` so a "closed to bookings" row is
 * visually distinct without an extra label (the modal still shows the
 * flag explicitly when the user opens it).
 */
export default function ScheduleChip({
  schedule,
  color,
  onClick,
}: ScheduleChipProps) {
  const locale = useLocale();
  const start = parseISODatetime(schedule.startAt);
  const timeLabel = start ? formatTime(start, locale) : "";
  const doctorName = schedule.doctor.lastNameEn;
  const departmentLabel = schedule.department.name;
  const ariaLabel = `${timeLabel} ${doctorName} ${departmentLabel}`;
  // Past schedules dim slightly so the user can scan "already happened"
  // separately from "upcoming". The closed-to-bookings 0.55 dim kept below
  // remains stronger so the two states stay distinguishable.
  const isPast = isScheduleReadOnly(schedule);
  const opacity = !schedule.acceptsBooking ? 0.55 : isPast ? 0.7 : 1;

  return (
    <ButtonBase
      onClick={(event) => {
        event.stopPropagation();
        onClick(schedule);
      }}
      sx={{
        width: "100%",
        textAlign: "left",
        justifyContent: "flex-start",
        px: 0.5,
        py: 0.25,
        borderRadius: 0.5,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        opacity,
        fontSize: 11,
        lineHeight: 1.25,
        minHeight: 20,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        overflow: "hidden",
        whiteSpace: "nowrap",
        "&:hover": {
          bgcolor: "action.hover",
        },
      }}
      aria-label={ariaLabel}
    >
      <Box
        aria-hidden
        sx={{
          flexShrink: 0,
          width: 6,
          height: 6,
          borderRadius: "50%",
          bgcolor: color,
        }}
      />
      <Box
        component="span"
        sx={{
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {timeLabel}
      </Box>
      <Box
        component="span"
        sx={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
          flex: 1,
        }}
      >
        {doctorName}
      </Box>
    </ButtonBase>
  );
}
