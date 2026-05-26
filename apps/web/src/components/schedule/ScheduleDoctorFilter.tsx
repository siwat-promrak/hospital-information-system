"use client";

import Box from "@mui/material/Box";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
import DoctorSelect from "@/components/shared/select/DoctorSelect";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { SCHEDULE_QUERY_PARAM } from "@/lib/api/schedule.const";
import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import type { DoctorListRow } from "@/types/doctor.types";

interface ScheduleDoctorFilterProps {
  /**
   * Page-1 SSR seed for the doctor picker. The picker streams subsequent
   * pages itself via `<DoctorSelect>`.
   */
  doctorSeed: PaginatedListInitial<DoctorListRow>;
  /**
   * Optional department filter forwarded to incremental fetches. Typically:
   *   - mode `DEPT` (NURSE)           → caller's department id
   *   - mode `OWN_PLUS_DEPT` / dept   → caller's department id
   */
  scopeDepartmentId?: string;
  /** Currently-active doctor id (`null` when "All doctors" picked). */
  activeDoctorId: string | null;
  /**
   * URL params the page wants to keep when the filter changes (calendar
   * view, month / week date params, scope toggle if visible). Re-emitted
   * verbatim — `undefined` / empty values are stripped.
   */
  preserveParams: Readonly<Record<string, string | undefined>>;
}

/**
 * Doctor picker for the unified `/schedules` page. Routes to
 * `FE_PATH.SCHEDULES` on selection / clear.
 *
 * Modes that render this filter:
 *   - `DEPT` (NURSE)
 *   - `OWN_PLUS_DEPT` with `scope=dept` (DOCTOR viewing their department)
 *
 * Wraps `<DoctorSelect>` — every detail of the doctor-page loader, the
 * reset-on-department-change cascade, and the i18n bag is owned by the
 * entity wrapper. This component only owns the page-level concerns:
 * mirroring `activeDoctorId` into local state, applying the contextual
 * "Filter by doctor" label, and routing on selection change.
 */
export default function ScheduleDoctorFilter({
  doctorSeed,
  scopeDepartmentId,
  activeDoctorId,
  preserveParams,
}: ScheduleDoctorFilterProps) {
  const tSchedules = useTranslations(NS.Schedules);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local "currently selected" mirror of the URL's `activeDoctorId`. The
  // BE-side seed contains the first page of doctors, which is enough to
  // resolve the picker's selected row in 99% of cases; pages past page 1
  // load incrementally as the user scrolls.
  const [selected, setSelected] = useState<DoctorListRow | null>(() => {
    return doctorSeed.data.find((d) => d.id === activeDoctorId) ?? null;
  });

  function navigateToDoctor(nextDoctor: DoctorListRow | null) {
    setSelected(nextDoctor);

    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(preserveParams)) {
      if (value !== undefined && value !== "") {
        search.set(key, value);
      }
    }

    if (nextDoctor) {
      search.set(SCHEDULE_QUERY_PARAM.DOCTOR_ID, nextDoctor.id);
    }

    startTransition(() => {
      router.replace(`${FE_PATH.SCHEDULES}?${search.toString()}`);
    });
  }

  return (
    <Box sx={{ minWidth: { xs: "100%", sm: 280 } }}>
      <DoctorSelect
        value={selected}
        onChange={navigateToDoctor}
        departmentId={scopeDepartmentId}
        initial={doctorSeed}
        label={tSchedules(K.Schedules.filterByDoctor)}
        placeholder={tSchedules(K.Schedules.allDoctors)}
        disabled={isPending}
      />
    </Box>
  );
}
