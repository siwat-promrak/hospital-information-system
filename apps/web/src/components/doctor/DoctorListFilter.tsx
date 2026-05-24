"use client";

import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
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
 */
export default function DoctorListFilter({
  departments,
  activeDepartmentId,
}: DoctorListFilterProps) {
  const tHeader = useTranslations(NS.DirectoryDoctors);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(event: SelectChangeEvent<string>) {
    const value = event.target.value;
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
    <FormControl
      size="small"
      sx={{ minWidth: { xs: "100%", sm: 240 } }}
      disabled={isPending}
    >
      <InputLabel id="doctor-department-filter">
        {tHeader(K.Directory.Doctors.filterByDepartment)}
      </InputLabel>
      <Select
        labelId="doctor-department-filter"
        label={tHeader(K.Directory.Doctors.filterByDepartment)}
        value={activeDepartmentId ?? ""}
        onChange={handleChange}
      >
        <MenuItem value="">
          {tHeader(K.Directory.Doctors.allDepartments)}
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
