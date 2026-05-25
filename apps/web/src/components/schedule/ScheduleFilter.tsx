"use client";

import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import {
  SCHEDULE_QUERY_PARAM,
  type ScheduleView,
} from "@/lib/api/schedule.const";
import type { DepartmentRow } from "@/types/department.types";

interface ScheduleFilterProps {
  departments: readonly DepartmentRow[];
  activeDepartmentId: string | null;
  /** Locale-aware base URL of the page (e.g. `/schedules` or `/me/schedule`). */
  basePath: string;
  /** Active calendar view — preserved across filter changes. */
  view: ScheduleView;
  /** `?month=YYYY-MM` — preserved when present. */
  month?: string;
  /** `?weekStart=YYYY-MM-DD` — preserved when present. */
  weekStart?: string;
}

/**
 * Department selector for the F06 schedule pages. Mirrors `DoctorListFilter`
 * — writes `?departmentId=<uuid>` (or clears it) via `router.replace` so
 * the URL stays the canonical source of truth and the back button retraces
 * filter changes.
 *
 * Preserves the view + date URL state so a filter change keeps the user
 * on the same month / week they were viewing. There is no `page=` reset
 * because the calendar isn't paginated (the page fetches a single large
 * page that captures every schedule for the focused range).
 */
export default function ScheduleFilter({
  departments,
  activeDepartmentId,
  basePath,
  view,
  month,
  weekStart,
}: ScheduleFilterProps) {
  const tSchedules = useTranslations(NS.Schedules);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(event: SelectChangeEvent<string>) {
    const value = event.target.value;
    const search = new URLSearchParams();

    search.set(SCHEDULE_QUERY_PARAM.VIEW, view);

    if (month) {
      search.set(SCHEDULE_QUERY_PARAM.MONTH, month);
    }

    if (weekStart) {
      search.set(SCHEDULE_QUERY_PARAM.WEEK_START, weekStart);
    }

    if (value) {
      search.set(SCHEDULE_QUERY_PARAM.DEPARTMENT_ID, value);
    }

    startTransition(() => {
      router.replace(`${basePath}?${search.toString()}`);
    });
  }

  return (
    <FormControl
      size="small"
      sx={{ minWidth: { xs: "100%", sm: 240 } }}
      disabled={isPending}
    >
      <InputLabel id="schedule-department-filter">
        {tSchedules(K.Schedules.filterByDepartment)}
      </InputLabel>
      <Select
        labelId="schedule-department-filter"
        label={tSchedules(K.Schedules.filterByDepartment)}
        value={activeDepartmentId ?? ""}
        onChange={handleChange}
      >
        <MenuItem value="">
          {tSchedules(K.Schedules.allDepartments)}
        </MenuItem>
        {departments.map((dept) => (
          <MenuItem key={dept.id} value={dept.id}>
            {dept.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
