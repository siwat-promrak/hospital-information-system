"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, type MouseEvent } from "react";

import ScheduleChip from "@/components/schedule/ScheduleChip";
import { K, NS } from "@/i18n/keys.generated";
import {
  compareISODatetime,
  isSameLocalDate,
  parseISODatetime,
  toISODateLocal,
} from "@/lib/utils/date";
import {
  buildMonthGrid,
  isInMonth,
  weekdayHeaders,
  type MonthParam,
} from "@/schedule/month";
import type { ScheduleResponse } from "@/types/schedule.types";

interface ScheduleMonthViewProps {
  schedules: readonly ScheduleResponse[];
  month: MonthParam;
  colorForDepartment: (departmentId: string) => string;
  /**
   * Called when the user clicks an empty area of a date cell OR the
   * overflow "+ N more" link. The host opens the day-details dialog
   * for that date — it lists every schedule on the day and exposes a
   * Create-schedule action.
   */
  onDateSelect: (cellDate: Date) => void;
  onScheduleClick: (schedule: ScheduleResponse) => void;
}

/** How many chips to render per cell before collapsing to "+ N more". */
const MAX_CHIPS_PER_CELL = 3;

/**
 * Month grid (6 rows × 7 days). Each cell hosts the chips for its
 * calendar date, sorted by start time. Adjacent-month cells render
 * their chips too but stay visually faded (via the cell's lower
 * opacity) so the viewer can read the month boundary without losing
 * sight of real schedules that fall on the leading / trailing days.
 *
 * Click empty cell area OR "+ N more" → host opens the day-details
 * dialog (a list of every schedule on that date + a Create button).
 * Click a chip → host opens the edit modal directly.
 */
export default function ScheduleMonthView({
  schedules,
  month,
  colorForDepartment,
  onDateSelect,
  onScheduleClick,
}: ScheduleMonthViewProps) {
  const tSchedules = useTranslations(NS.Schedules);
  const locale = useLocale();

  const weekdayLabels = useMemo(
    () => weekdayHeaders(locale, "monday"),
    [locale],
  );

  // Bucket schedules by local-date `YYYY-MM-DD` once, then look up by cell.
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

    for (const list of map.values()) {
      list.sort((a, b) => compareISODatetime(a.startAt, b.startAt));
    }

    return map;
  }, [schedules]);

  const monthGrid = useMemo(() => buildMonthGrid(month), [month]);
  const today = useMemo(() => new Date(), []);

  function handleCellClick(
    _event: MouseEvent<HTMLDivElement>,
    cellDate: Date,
  ) {
    onDateSelect(cellDate);
  }

  return (
    // `overflow: "visible"` MUST stay — MUI's `Card` root ships with
    // `overflow: "hidden"` baked into its styled root class (see
    // `@mui/material/Card/Card.js`), and that clipping context silently
    // breaks `position: sticky` on the weekday-header Box below. The
    // sticky element's scroll container is the `<Box overflowY="auto">`
    // in `ScheduleCalendar.tsx`; an intermediate ancestor with
    // `overflow: hidden` would clip the sticky header inside the Card.
    <Card variant="outlined" sx={{ overflow: "visible" }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          position: "sticky",
          top: 0,
          zIndex: 2,
        }}
      >
        {weekdayLabels.map((label, idx) => (
          <Box
            key={`${label}-${idx}`}
            sx={{
              p: 1,
              textAlign: "center",
              borderLeft: idx === 0 ? 0 : 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="subtitle2" fontWeight={600}>
              {label}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridAutoRows: "minmax(120px, auto)",
        }}
      >
        {monthGrid.flatMap((row, rowIdx) =>
          row.map((cellDate, colIdx) => {
            const inMonth = isInMonth(cellDate, month);
            const dateKey = toISODateLocal(cellDate);
            // Render chips for EVERY cell — adjacent-month days carry the
            // cell's lower opacity (set below) so they visually recede, but
            // a real schedule on a leading / trailing day stays visible
            // and clickable. Hiding them entirely silently drops data the
            // user otherwise has no way to see from the month view.
            const cellSchedules = schedulesByDate.get(dateKey) ?? [];
            const isToday = isSameLocalDate(cellDate, today);
            const visibleChips = cellSchedules.slice(0, MAX_CHIPS_PER_CELL);
            const hiddenCount = cellSchedules.length - visibleChips.length;

            return (
              <Box
                key={`${rowIdx}-${colIdx}`}
                onClick={(event) => handleCellClick(event, cellDate)}
                sx={{
                  borderTop: rowIdx === 0 ? 0 : 1,
                  borderLeft: colIdx === 0 ? 0 : 1,
                  borderColor: "divider",
                  p: 0.75,
                  minHeight: 120,
                  cursor: "pointer",
                  bgcolor: inMonth ? "background.paper" : "action.hover",
                  opacity: inMonth ? 1 : 0.6,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  "&:hover": {
                    bgcolor: inMonth ? "action.hover" : "action.selected",
                  },
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Box
                    component="span"
                    sx={{
                      fontSize: 12,
                      fontWeight: isToday ? 700 : 500,
                      color: isToday
                        ? "primary.contrastText"
                        : "text.primary",
                      bgcolor: isToday ? "primary.main" : "transparent",
                      borderRadius: "50%",
                      width: 22,
                      height: 22,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {cellDate.getDate()}
                  </Box>
                </Stack>

                {visibleChips.map((schedule) => (
                  <ScheduleChip
                    key={schedule.id}
                    schedule={schedule}
                    color={colorForDepartment(schedule.departmentId)}
                    onClick={onScheduleClick}
                  />
                ))}

                {hiddenCount > 0 ? (
                  <Box
                    component="button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDateSelect(cellDate);
                    }}
                    sx={{
                      mt: "auto",
                      alignSelf: "flex-start",
                      background: "none",
                      border: 0,
                      px: 0.5,
                      cursor: "pointer",
                      color: "primary.main",
                      fontSize: 11,
                      textAlign: "left",
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    {tSchedules(K.Schedules.moreCount, {
                      count: hiddenCount,
                    })}
                  </Box>
                ) : null}
              </Box>
            );
          }),
        )}
      </Box>
    </Card>
  );
}
