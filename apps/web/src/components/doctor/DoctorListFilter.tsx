"use client";

import Box from "@mui/material/Box";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
import DepartmentSelect from "@/components/shared/select/DepartmentSelect";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { DOCTOR_QUERY_PARAM } from "@/lib/api/doctor.const";
import {
  DEFAULT_PAGE,
  PAGINATION_QUERY_PARAM,
} from "@/lib/api/pagination.const";
import type { DepartmentRow } from "@/types/department.types";

interface DoctorListFilterProps {
  departments: readonly DepartmentRow[];
  activeDepartmentId: string | null;
}

/**
 * Department-filter selector for `/doctors`. Updates the `departmentId`
 * query param via `router.replace` so the URL stays the canonical source
 * of truth and back/forward navigation works. Resets `page` to 1 on every
 * change so the new filter never lands on an out-of-range offset.
 *
 * The picker's × clear icon is the "All departments" affordance — picking
 * a department writes the param; clearing it removes the param + falls
 * back to the unfiltered list.
 */
export default function DoctorListFilter({
  departments,
  activeDepartmentId,
}: DoctorListFilterProps) {
  const tHeader = useTranslations(NS.DirectoryDoctors);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | "") {
    const search = new URLSearchParams();

    search.set(PAGINATION_QUERY_PARAM.PAGE, String(DEFAULT_PAGE));

    if (value) {
      search.set(DOCTOR_QUERY_PARAM.DEPARTMENT_ID, value);
    }

    startTransition(() => {
      router.replace(`${FE_PATH.DOCTORS}?${search.toString()}`);
    });
  }

  return (
    <Box sx={{ minWidth: { xs: "100%", sm: 240 } }}>
      <DepartmentSelect
        value={activeDepartmentId ?? ""}
        onChange={handleChange}
        departments={departments}
        label={tHeader(K.Directory.Doctors.filterByDepartment)}
        size="small"
        clearable
        disabled={isPending}
      />
    </Box>
  );
}
