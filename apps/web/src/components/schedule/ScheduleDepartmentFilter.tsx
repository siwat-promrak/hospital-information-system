"use client";

import Box from "@mui/material/Box";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
import DepartmentSelect from "@/components/shared/select/DepartmentSelect";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { SCHEDULE_QUERY_PARAM } from "@/lib/api/schedule.const";
import type { DepartmentRow } from "@/types/department.types";

interface ScheduleDepartmentFilterProps {
  departments: readonly DepartmentRow[];
  /** Currently-active department id (`null` when "All departments" picked). */
  activeDepartmentId: string | null;
  /**
   * URL params the page wants to keep when the filter changes (calendar
   * view, month / week date params, scope toggle if visible). Re-emitted
   * verbatim — `undefined` / empty values are stripped so cleared filters
   * don't linger.
   */
  preserveParams: Readonly<Record<string, string | undefined>>;
}

/**
 * Department picker for the unified `/schedules` page — only rendered in
 * mode `"all"` (MRO with `schedule.read.all`). Picking a department writes
 * `?departmentId=<uuid>`; clearing it via the × icon removes the param.
 * The page server-component re-runs the BE list call with the new filter.
 *
 * Always routes to `FE_PATH.SCHEDULES` (the page is now unified). The
 * caller passes `preserveParams` so the calendar's date / view state
 * survives the filter change.
 */
export default function ScheduleDepartmentFilter({
  departments,
  activeDepartmentId,
  preserveParams,
}: ScheduleDepartmentFilterProps) {
  const tSchedules = useTranslations(NS.Schedules);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(nextDepartmentId: string | "") {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(preserveParams)) {
      if (value !== undefined && value !== "") {
        search.set(key, value);
      }
    }

    if (nextDepartmentId) {
      search.set(SCHEDULE_QUERY_PARAM.DEPARTMENT_ID, nextDepartmentId);
    }

    startTransition(() => {
      router.replace(`${FE_PATH.SCHEDULES}?${search.toString()}`);
    });
  }

  return (
    <Box sx={{ minWidth: { xs: "100%", sm: 240 } }}>
      <DepartmentSelect
        value={activeDepartmentId ?? ""}
        onChange={handleChange}
        departments={departments}
        label={tSchedules(K.Schedules.filterByDepartment)}
        size="small"
        clearable
        disabled={isPending}
      />
    </Box>
  );
}
