"use client";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { useTransition } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import {
  SCHEDULE_QUERY_PARAM,
  SCHEDULE_VIEW,
  type ScheduleView,
} from "@/lib/api/schedule.const";

interface ScheduleViewToggleProps {
  view: ScheduleView;
  /** Locale-aware base URL of the page (e.g. `/schedules` or `/me/schedule`). */
  basePath: string;
  /**
   * Other URL params that must survive the toggle (departmentId, month,
   * weekStart). Re-emitted verbatim so flipping between views keeps every
   * other piece of URL state intact.
   */
  preserveParams: Readonly<Record<string, string | undefined>>;
}

/**
 * Segmented toggle that flips the page between the month-grid and the
 * week-grid views. Stored in the URL as `?view=month|week` so a deep link
 * preserves the user's choice.
 *
 * The toggle never strips the date params — switching from month to week
 * keeps `?month=` in the URL so the next month-switch lands the user
 * back where they were. The page server-component picks the active date
 * source based on `view`.
 */
export default function ScheduleViewToggle({
  view,
  basePath,
  preserveParams,
}: ScheduleViewToggleProps) {
  const tSchedules = useTranslations(NS.Schedules);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(
    _event: MouseEvent<HTMLElement>,
    nextValue: ScheduleView | null,
  ) {
    if (!nextValue || nextValue === view) {
      return;
    }

    const search = new URLSearchParams();
    search.set(SCHEDULE_QUERY_PARAM.VIEW, nextValue);

    for (const [key, value] of Object.entries(preserveParams)) {
      if (value !== undefined && value !== "") {
        search.set(key, value);
      }
    }

    startTransition(() => {
      router.replace(`${basePath}?${search.toString()}`);
    });
  }

  return (
    <ToggleButtonGroup
      value={view}
      exclusive
      onChange={handleChange}
      size="small"
      color="primary"
      disabled={isPending}
      aria-label={tSchedules(K.Schedules.viewToggleAriaLabel)}
    >
      <ToggleButton value={SCHEDULE_VIEW.MONTH}>
        {tSchedules(K.Schedules.viewMonth)}
      </ToggleButton>
      <ToggleButton value={SCHEDULE_VIEW.WEEK}>
        {tSchedules(K.Schedules.viewWeek)}
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
