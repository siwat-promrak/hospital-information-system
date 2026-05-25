"use client";

import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { dayjs } from "@/lib/dayjs";
import {
  compareISODatetime,
  formatDate,
  formatTime,
  parseISODatetime,
  toISODateLocal,
} from "@/lib/utils/date";
import { isScheduleReadOnly } from "@/schedule/time";
import type { ScheduleResponse } from "@/types/schedule.types";

interface ScheduleDayMobileListProps {
  schedules: readonly ScheduleResponse[];
  colorForDepartment: (departmentId: string) => string;
  canCreate: boolean;
  onCreateForDate: (date: Date) => void;
  onScheduleClick: (schedule: ScheduleResponse) => void;
}

interface DateBucket {
  /** First instant of the day — used for ordering + the "Add for X" handler. */
  date: Date;
  /** `YYYY-MM-DD` local-date key. */
  key: string;
  schedules: ScheduleResponse[];
}

/**
 * A 6×7 month grid is illegible on phones, so on `xs` / `sm` the calendar
 * collapses to a chronological vertical list. One section per calendar
 * date that actually has schedules in the focused month, ordered by date.
 * Each section's "Add" button pre-fills the create modal with that date.
 *
 * Dates with no schedules are omitted — a 30-day phone scroll of empty
 * placeholders adds noise without value; the user can reach those dates
 * via the desktop calendar or the page-level "Add schedule" button.
 */
export default function ScheduleDayMobileList({
  schedules,
  colorForDepartment,
  canCreate,
  onCreateForDate,
  onScheduleClick,
}: ScheduleDayMobileListProps) {
  const tSchedules = useTranslations(NS.Schedules);
  const tForm = useTranslations(NS.SchedulesForm);
  const locale = useLocale();

  const buckets = useMemo<DateBucket[]>(() => {
    const map = new Map<string, DateBucket>();

    for (const schedule of schedules) {
      const start = parseISODatetime(schedule.startAt);

      if (!start) {
        continue;
      }

      const key = toISODateLocal(start);
      const existing = map.get(key);

      if (existing) {
        existing.schedules.push(schedule);

        continue;
      }

      const dayStart = dayjs(start).startOf("day").toDate();
      map.set(key, { date: dayStart, key, schedules: [schedule] });
    }

    const sortedBuckets = Array.from(map.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );

    for (const bucket of sortedBuckets) {
      bucket.schedules.sort((a, b) => compareISODatetime(a.startAt, b.startAt));
    }

    return sortedBuckets;
  }, [schedules]);

  if (buckets.length === 0) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" color="text.secondary">
        {tSchedules(K.Schedules.upcoming)}
      </Typography>
      {buckets.map((bucket) => {
        const dateLabel = formatDate(bucket.date, locale);

        return (
          <Box key={bucket.key}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle1" fontWeight={600}>
                {dateLabel}
              </Typography>
              {canCreate ? (
                <Button
                  size="small"
                  startIcon={<AddIcon fontSize="small" />}
                  onClick={() => onCreateForDate(bucket.date)}
                  aria-label={tSchedules(K.Schedules.addForDate, {
                    date: dateLabel,
                  })}
                >
                  {tForm(K.Schedules.Form.create)}
                </Button>
              ) : null}
            </Stack>
            <Stack spacing={1}>
              {bucket.schedules.map((schedule) => {
                const scheduleStart = parseISODatetime(schedule.startAt);
                const scheduleEnd = parseISODatetime(schedule.endAt);
                const breakStart = schedule.breakStartAt
                  ? parseISODatetime(schedule.breakStartAt)
                  : null;
                const breakEnd = schedule.breakEndAt
                  ? parseISODatetime(schedule.breakEndAt)
                  : null;

                const timeRange =
                  scheduleStart && scheduleEnd
                    ? `${formatTime(scheduleStart, locale)}–${formatTime(scheduleEnd, locale)}`
                    : "";
                const breakRange =
                  breakStart && breakEnd
                    ? `${formatTime(breakStart, locale)}–${formatTime(breakEnd, locale)}`
                    : null;
                const isPast = isScheduleReadOnly(schedule);

                return (
                  <Card key={schedule.id} variant="outlined">
                    <CardActionArea onClick={() => onScheduleClick(schedule)}>
                      <Box
                        sx={{
                          p: 1.25,
                          borderLeft: 4,
                          borderColor: colorForDepartment(schedule.departmentId),
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          justifyContent="space-between"
                          alignItems="flex-start"
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              noWrap
                            >
                              {schedule.doctor.firstNameEn}{" "}
                              {schedule.doctor.lastNameEn}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {timeRange}
                              {breakRange ? (
                                <>
                                  {" · "}
                                  {tSchedules(K.Schedules.breakLabel)}{" "}
                                  {breakRange}
                                </>
                              ) : null}
                            </Typography>
                          </Box>
                          <Stack
                            direction="row"
                            spacing={0.5}
                            sx={{ flexShrink: 0 }}
                          >
                            <Chip
                              label={schedule.department.name}
                              size="small"
                              sx={{
                                bgcolor: colorForDepartment(
                                  schedule.departmentId,
                                ),
                                color: "primary.contrastText",
                                fontWeight: 600,
                              }}
                            />
                            {!schedule.acceptsBooking ? (
                              <Chip
                                label={tSchedules(
                                  K.Schedules.notAcceptingBookings,
                                )}
                                size="small"
                                variant="outlined"
                              />
                            ) : null}
                            {isPast ? (
                              <Chip
                                label={tSchedules(K.Schedules.pastBadge)}
                                size="small"
                                variant="outlined"
                              />
                            ) : null}
                          </Stack>
                        </Stack>
                      </Box>
                    </CardActionArea>
                  </Card>
                );
              })}
            </Stack>
            <Divider sx={{ mt: 2 }} />
          </Box>
        );
      })}
    </Stack>
  );
}
