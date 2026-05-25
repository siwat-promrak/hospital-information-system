"use client";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import {
  SCHEDULE_QUERY_PARAM,
  SCHEDULE_VIEW,
  type ScheduleView,
} from "@/lib/api/schedule.const";
import {
  addMonths,
  currentMonth,
  formatMonthLabel,
  formatMonthParam,
  type MonthParam,
} from "@/schedule/month";
import {
  addDays,
  currentWeekStart,
  formatWeekLabel,
  formatWeekStartParam,
  WEEK_DAYS,
} from "@/schedule/week";

interface ScheduleHeaderNavProps {
  view: ScheduleView;
  month: MonthParam;
  weekStart: Date;
  basePath: string;
  /**
   * Other URL params that must survive prev / today / next navigation
   * (currently only `departmentId`).
   */
  preserveParams: Readonly<Record<string, string | undefined>>;
}

/**
 * Header navigation strip for the schedule calendar — prev / today / next
 * + a label that shows the focused month or week depending on `view`.
 *
 * Step size is view-aware: month view jumps ±1 calendar month; week view
 * jumps ±7 days. "Today" jumps to the current month / current ISO Monday
 * respectively.
 *
 * The component preserves whichever date param is *not* currently active
 * (e.g. switching weeks keeps the `?month=` URL so a follow-up flip back
 * to the month view lands on a sensible spot) by leaving them in the
 * caller-supplied `preserveParams`.
 */
export default function ScheduleHeaderNav({
  view,
  month,
  weekStart,
  basePath,
  preserveParams,
}: ScheduleHeaderNavProps) {
  const tSchedules = useTranslations(NS.Schedules);
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function buildUrl(extra: Readonly<Record<string, string>>): string {
    const search = new URLSearchParams();

    // View first so it appears at the front of the URL.
    search.set(SCHEDULE_QUERY_PARAM.VIEW, view);

    for (const [key, value] of Object.entries(preserveParams)) {
      if (value !== undefined && value !== "") {
        search.set(key, value);
      }
    }

    for (const [key, value] of Object.entries(extra)) {
      search.set(key, value);
    }

    return `${basePath}?${search.toString()}`;
  }

  function navigate(extra: Readonly<Record<string, string>>) {
    startTransition(() => {
      router.replace(buildUrl(extra));
    });
  }

  function handlePrev() {
    if (view === SCHEDULE_VIEW.MONTH) {
      navigate({
        [SCHEDULE_QUERY_PARAM.MONTH]: formatMonthParam(addMonths(month, -1)),
      });

      return;
    }

    navigate({
      [SCHEDULE_QUERY_PARAM.WEEK_START]: formatWeekStartParam(
        addDays(weekStart, -WEEK_DAYS),
      ),
    });
  }

  function handleNext() {
    if (view === SCHEDULE_VIEW.MONTH) {
      navigate({
        [SCHEDULE_QUERY_PARAM.MONTH]: formatMonthParam(addMonths(month, 1)),
      });

      return;
    }

    navigate({
      [SCHEDULE_QUERY_PARAM.WEEK_START]: formatWeekStartParam(
        addDays(weekStart, WEEK_DAYS),
      ),
    });
  }

  function handleToday() {
    if (view === SCHEDULE_VIEW.MONTH) {
      navigate({
        [SCHEDULE_QUERY_PARAM.MONTH]: formatMonthParam(currentMonth()),
      });

      return;
    }

    navigate({
      [SCHEDULE_QUERY_PARAM.WEEK_START]: formatWeekStartParam(
        currentWeekStart(),
      ),
    });
  }

  const label =
    view === SCHEDULE_VIEW.MONTH
      ? formatMonthLabel(month, locale)
      : formatWeekLabel(weekStart, locale);

  const prevLabel =
    view === SCHEDULE_VIEW.MONTH
      ? tSchedules(K.Schedules.prevMonth)
      : tSchedules(K.Schedules.prevWeek);

  const nextLabel =
    view === SCHEDULE_VIEW.MONTH
      ? tSchedules(K.Schedules.nextMonth)
      : tSchedules(K.Schedules.nextWeek);

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      flexWrap="wrap"
    >
      <IconButton
        aria-label={prevLabel}
        onClick={handlePrev}
        size="small"
        disabled={isPending}
      >
        <ChevronLeftIcon />
      </IconButton>
      <Typography
        variant="h6"
        component="div"
        sx={{ minWidth: { xs: 160, md: 220 }, textAlign: "center" }}
      >
        {label}
      </Typography>
      <IconButton
        aria-label={nextLabel}
        onClick={handleNext}
        size="small"
        disabled={isPending}
      >
        <ChevronRightIcon />
      </IconButton>
      <Button
        size="small"
        variant="outlined"
        onClick={handleToday}
        disabled={isPending}
      >
        {tSchedules(K.Schedules.today)}
      </Button>
    </Stack>
  );
}
