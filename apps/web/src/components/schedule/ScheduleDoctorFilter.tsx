"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";

import SearchableSelect from "@/components/shared/SearchableSelect";
import { FE_PATH } from "@/auth/routes";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { SCHEDULE_QUERY_PARAM } from "@/lib/api/schedule.const";
import { useIncrementalDoctorList } from "@/lib/api/use-incremental-doctor-list";
import type { DoctorListRow } from "@/types/doctor.types";

interface ScheduleDoctorFilterProps {
  /**
   * First page of doctors fetched on the server. Subsequent pages stream
   * in via the shared `useIncrementalDoctorList` hook as the user scrolls
   * the dropdown.
   */
  doctors: readonly DoctorListRow[];
  /**
   * Total doctor count behind the current subset. Drives the
   * "Showing X of Y" hint and the `hasMore` flip.
   */
  doctorsTotal: number;
  /**
   * Page the SSR `doctors` payload corresponds to (`1` for first render).
   */
  initialDoctorPage: number;
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
 * Search-completeness caveat: the substring filter inside
 * `SearchableSelect` runs ONLY over rows already loaded. The BE doesn't
 * yet accept `?q=` on `/doctors`, so a doctor on page 5 won't surface in
 * search until the user has scrolled far enough to fetch them. The
 * `searchScopedHint` slot surfaces the caveat; swap to a debounced
 * server-driven search when the BE adds `?q=`.
 */
export default function ScheduleDoctorFilter({
  doctors,
  doctorsTotal,
  initialDoctorPage,
  scopeDepartmentId,
  activeDoctorId,
  preserveParams,
}: ScheduleDoctorFilterProps) {
  const tSchedules = useTranslations(NS.Schedules);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { loaded, isLoadingMore, hasMore, loadMore } = useIncrementalDoctorList({
    initialDoctors: doctors,
    total: doctorsTotal,
    initialPage: initialDoctorPage,
    departmentId: scopeDepartmentId,
  });

  const selectedDoctor = useMemo(
    () => loaded.find((d) => d.id === activeDoctorId) ?? null,
    [loaded, activeDoctorId],
  );

  function navigateToDoctor(nextDoctorId: string | null) {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(preserveParams)) {
      if (value !== undefined && value !== "") {
        search.set(key, value);
      }
    }

    if (nextDoctorId) {
      search.set(SCHEDULE_QUERY_PARAM.DOCTOR_ID, nextDoctorId);
    }

    startTransition(() => {
      router.replace(`${FE_PATH.SCHEDULES}?${search.toString()}`);
    });
  }

  return (
    <Box sx={{ minWidth: { xs: "100%", sm: 280 } }}>
      <SearchableSelect<DoctorListRow>
        value={selectedDoctor}
        onChange={(next) => navigateToDoctor(next?.id ?? null)}
        options={loaded}
        loadMore={loadMore}
        hasMore={hasMore}
        isLoading={isLoadingMore}
        hasMoreLabel={tSchedules(K.Schedules.doctorShowingCount, {
          loaded: loaded.length,
          total: doctorsTotal,
        })}
        loadingMoreLabel={tSchedules(K.Schedules.doctorLoadingMore)}
        searchScopedHint={tSchedules(K.Schedules.doctorSearchScopedHint)}
        getOptionLabel={(option) =>
          `${option.fullName} (${option.doctorCode})`
        }
        getOptionKey={(option) => option.id}
        renderOption={(option) => (
          <Box sx={{ display: "flex", flexDirection: "column", py: 0.25 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {option.fullName}{" "}
              <Box
                component="span"
                sx={{ color: "text.secondary", fontWeight: 400 }}
              >
                ({option.doctorCode})
              </Box>
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ whiteSpace: "normal" }}
            >
              {option.department.name}
            </Typography>
          </Box>
        )}
        label={tSchedules(K.Schedules.filterByDoctor)}
        placeholder={tSchedules(K.Schedules.allDoctors)}
        noOptionsText={tSchedules(K.Schedules.allDoctors)}
        disabled={isPending}
      />
    </Box>
  );
}
