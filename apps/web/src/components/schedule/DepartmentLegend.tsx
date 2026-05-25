"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { makeDepartmentColorResolver } from "@/schedule/department-palette";
import type { DepartmentRow } from "@/types/department.types";

interface DepartmentLegendProps {
  /**
   * Full sorted department list — the legend mirrors what the calendar
   * uses for colour assignment so every chip / swatch lines up. Passing
   * a subset would desynchronise the two surfaces.
   */
  departments: readonly DepartmentRow[];
}

/**
 * Department colour legend rendered on the `/schedules` page when the
 * caller is in mode `"all"` (MRO with `schedule.read.all`). Only that mode
 * mixes schedules from multiple departments in a single calendar window —
 * the other modes (`"dept"`, `"own"`, `"own+dept"`) already narrow to a
 * single department so the legend would be noise.
 *
 * The component is a thin client component because the colour resolver is
 * the same one the calendar uses (lives in `schedule/department-palette`)
 * and keeping both surfaces driven by one helper guarantees the swatches
 * match the chip colours exactly.
 *
 * Renders nothing when only one department exists (legend would be a
 * single redundant row).
 */
export default function DepartmentLegend({ departments }: DepartmentLegendProps) {
  const tSchedules = useTranslations(NS.Schedules);
  const colorForDepartment = useMemo(
    () => makeDepartmentColorResolver(departments),
    [departments],
  );

  if (departments.length <= 1) {
    return null;
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      flexWrap="wrap"
      rowGap={0.5}
      columnGap={1.5}
      sx={{
        px: 1,
        py: 0.75,
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "background.paper",
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mr: 0.5, fontWeight: 600 }}
      >
        {tSchedules(K.Schedules.legendTitle)}
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
  );
}
