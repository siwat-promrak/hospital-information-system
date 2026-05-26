"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
import AppointmentTypeSelect from "@/components/shared/select/AppointmentTypeSelect";
import DepartmentSelect from "@/components/shared/select/DepartmentSelect";
import DoctorSelect from "@/components/shared/select/DoctorSelect";
import {
  FIND_SLOT_QUERY_PARAM,
  FIND_SLOT_SCOPE,
  type FindSlotScope,
} from "@/find-slot/find-slot.const";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { getDepartmentAppointmentTypesAction } from "@/lib/api/department.actions";
import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import { todayLocalISODate } from "@/lib/utils/date";
import type { AppointmentType } from "@/types/appointment-type.types";
import type {
  DepartmentAppointmentTypeRow,
  DepartmentRow,
} from "@/types/department.types";
import type { DoctorListRow } from "@/types/doctor.types";

interface FindSlotFilterCardProps {
  /**
   * Show the department picker. ALL mode (MRO) is the only mode where a
   * caller picks a department; every other mode pins it to the session's
   * department. The page hides the field — the prop is forwarded purely to
   * keep the filter row layout in sync.
   */
  showDepartmentFilter: boolean;
  /**
   * Show the doctor picker. Visible in ALL, DEPT, and OWN_PLUS_DEPT+dept;
   * hidden in OWN_PLUS_DEPT+mine and OWN. When hidden, the caller's
   * doctor is pinned server-side.
   */
  showDoctorFilter: boolean;
  /** Department catalog for the dept picker (ALL mode). */
  departments: readonly DepartmentRow[];
  /**
   * Effective department in scope — drives the per-department appointment
   * type catalog fetch AND the doctor picker's filter. In ALL mode this is
   * the URL-picked `?departmentId=`; in every other mode it's the caller's
   * home department.
   */
  effectiveDepartmentId: string | undefined;
  /** Currently-picked department from the URL (`""` when none). */
  activeDepartmentId: string;
  /** SSR seed for the doctor picker — scoped to `effectiveDepartmentId`. */
  doctorSeed: PaginatedListInitial<DoctorListRow>;
  /** Currently-picked doctor row (resolved on the page from the URL). */
  initialDoctor: DoctorListRow | null;
  /** Currently-picked appointment type (`""` when none). */
  activeAppointmentType: AppointmentType | "";
  /** Currently-picked date (`YYYY-MM-DD`). Defaults to today. */
  activeDate: string;
  /**
   * Active OWN_PLUS_DEPT scope. The card preserves it on Search submit so
   * flipping to `dept` and then clicking Search doesn't silently revert
   * the URL back to the default `mine` scope.
   */
  scope: FindSlotScope;
}

/**
 * F15 filter card. The user composes the search tuple
 * (department / doctor / appointment type / date) in this card; the
 * "Search" button pushes the resulting URL and the page server-component
 * re-renders the results below.
 *
 * Why client-only state: the filter card is the URL-state authoring
 * surface — the user composes the search tuple here, BEFORE the page
 * re-renders. Local state lives in this component until the user clicks
 * Search, at which point the URL is updated and the page server-component
 * picks up the new state from `searchParams`. Treating the card as a
 * stateless mirror of the URL (auto-pushing on every keypress) would
 * thrash the network and feel laggy on the date picker — the explicit
 * Search button is the deliberate commit boundary.
 *
 * `appointmentType` is REQUIRED — the search button stays disabled until
 * the user picks one. The per-`(department, type)` duration drives the
 * BE's slot grid step, so a `type`-less search is a no-op.
 */
export default function FindSlotFilterCard({
  showDepartmentFilter,
  showDoctorFilter,
  departments,
  effectiveDepartmentId,
  activeDepartmentId,
  doctorSeed,
  initialDoctor,
  activeAppointmentType,
  activeDate,
  scope,
}: FindSlotFilterCardProps) {
  const t = useTranslations(NS.FindSlotFilterCard);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [departmentId, setDepartmentId] = useState<string>(activeDepartmentId);
  const [doctor, setDoctor] = useState<DoctorListRow | null>(initialDoctor);
  const [appointmentType, setAppointmentType] = useState<AppointmentType | "">(
    activeAppointmentType,
  );
  const [date, setDate] = useState<string>(activeDate || todayLocalISODate());
  const [departmentTypes, setDepartmentTypes] = useState<
    readonly DepartmentAppointmentTypeRow[]
  >([]);

  // Cascade the picked department into the doctor picker so the scope
  // follows the effective department. In ALL mode the URL drives the
  // department; in other modes it's pinned server-side and this prop is
  // already the caller's home department.
  const doctorPickerDepartmentId = showDepartmentFilter
    ? departmentId || undefined
    : effectiveDepartmentId;

  // Fetch the per-(department, type) catalog whenever the effective
  // department changes — same pattern as the booking wizard's
  // `<AppointmentTypeSelect>` setup. When no department is in scope yet
  // (ALL mode + no `?departmentId=`), the type select sits disabled.
  useEffect(() => {
    if (!doctorPickerDepartmentId) {
      setDepartmentTypes([]);

      return;
    }

    let cancelled = false;

    (async () => {
      const rows = await getDepartmentAppointmentTypesAction(
        doctorPickerDepartmentId,
      );

      if (!cancelled) {
        setDepartmentTypes(rows);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doctorPickerDepartmentId]);

  // When the department changes, drop the picked type if it's no longer
  // in the new catalog — matches the booking wizard's safety cascade.
  useEffect(() => {
    if (!appointmentType) {
      return;
    }

    if (departmentTypes.length === 0) {
      return;
    }

    const stillOffered = departmentTypes.some(
      (row) => row.code === appointmentType,
    );

    if (!stillOffered) {
      setAppointmentType("");
    }
  }, [departmentTypes, appointmentType]);

  // When the department changes, drop the picked doctor if the new
  // department's scope no longer includes them.
  useEffect(() => {
    if (!doctor) {
      return;
    }

    if (
      doctorPickerDepartmentId &&
      doctor.departmentId !== doctorPickerDepartmentId
    ) {
      setDoctor(null);
    }
  }, [doctor, doctorPickerDepartmentId]);

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!appointmentType) {
      return;
    }

    const search = new URLSearchParams();

    // Preserve the OWN_PLUS_DEPT scope toggle. `mine` is the resolver's
    // default so it can stay omitted; `dept` must be set explicitly or
    // the page falls back to `mine` and the doctor picker disappears.
    if (scope === FIND_SLOT_SCOPE.DEPT) {
      search.set(FIND_SLOT_QUERY_PARAM.SCOPE, scope);
    }

    if (showDepartmentFilter && departmentId) {
      search.set(FIND_SLOT_QUERY_PARAM.DEPARTMENT_ID, departmentId);
    }

    if (showDoctorFilter && doctor) {
      search.set(FIND_SLOT_QUERY_PARAM.DOCTOR_ID, doctor.id);
    }

    search.set(FIND_SLOT_QUERY_PARAM.TYPE, appointmentType);
    search.set(FIND_SLOT_QUERY_PARAM.DATE, date);

    startTransition(() => {
      router.replace(`${FE_PATH.FIND_SLOT}?${search.toString()}`);
    });
  }

  const searchDisabled = !appointmentType || !date || isPending;

  return (
    <Card variant="outlined">
      <CardContent>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2.5}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
              }}
            >
              {showDepartmentFilter ? (
                <DepartmentSelect
                  value={departmentId}
                  onChange={setDepartmentId}
                  departments={departments}
                  label={t(K.FindSlot.filterCard.departmentLabel)}
                  clearable
                  disabled={isPending}
                />
              ) : null}
              {showDoctorFilter ? (
                <Box sx={{ minWidth: 0 }}>
                  <DoctorSelect
                    value={doctor}
                    onChange={setDoctor}
                    departmentId={doctorPickerDepartmentId}
                    initial={doctorSeed}
                    label={t(K.FindSlot.filterCard.doctorLabel)}
                    clearable
                    disabled={isPending}
                  />
                </Box>
              ) : null}
              <AppointmentTypeSelect
                value={appointmentType}
                onChange={setAppointmentType}
                types={departmentTypes}
                label={t(K.FindSlot.filterCard.appointmentTypeLabel)}
                required
                disabled={
                  isPending ||
                  !doctorPickerDepartmentId ||
                  departmentTypes.length === 0
                }
                helperText={
                  !appointmentType
                    ? t(K.FindSlot.filterCard.typeRequiredHelper)
                    : undefined
                }
              />
              <TextField
                type="date"
                required
                fullWidth
                label={t(K.FindSlot.filterCard.dateLabel)}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={isPending}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: todayLocalISODate() },
                }}
              />
            </Box>
            <Stack direction="row" justifyContent="flex-end">
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={searchDisabled}
              >
                {t(K.FindSlot.filterCard.searchButton)}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}
