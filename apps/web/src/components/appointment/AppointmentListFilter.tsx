"use client";

import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
import AppointmentStatusSelect from "@/components/shared/select/AppointmentStatusSelect";
import DepartmentSelect from "@/components/shared/select/DepartmentSelect";
import DoctorSelect from "@/components/shared/select/DoctorSelect";
import OrderSelect from "@/components/shared/select/OrderSelect";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import {
  APPOINTMENT_LIST_ORDER,
  APPOINTMENT_QUERY_PARAM,
  type AppointmentListOrderValue,
  type AppointmentStatusValue,
} from "@/lib/api/appointment.const";
import {
  DEFAULT_PAGE,
  PAGINATION_QUERY_PARAM,
} from "@/lib/api/pagination.const";
import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import type { DepartmentRow } from "@/types/department.types";
import type { DoctorListRow } from "@/types/doctor.types";

interface AppointmentListFilterProps {
  departments: readonly DepartmentRow[];
  /**
   * Page-1 SSR seed for the doctor picker. The picker streams subsequent
   * pages itself via `<DoctorSelect>`.
   */
  doctorSeed: PaginatedListInitial<DoctorListRow>;
  doctorScopeDepartmentId?: string;
  activeDepartmentId: string | null;
  activeDoctorId: string | null;
  activeStatus: AppointmentStatusValue | null;
  activeOrder: AppointmentListOrderValue;
  activeFrom: string;
  activeTo: string;
  /**
   * When `true` the department filter is rendered read-only — used for
   * NURSE callers whose role auto-narrows server-side.
   */
  departmentFilterDisabled: boolean;
  /**
   * When set, the doctor picker is pinned to this id and rendered
   * disabled — used when the caller's effective appointment-READ scope
   * is `.own` (no `.own-department`), so the URL `?doctorId` is
   * effectively a constant of the caller's own doctor id. The page also
   * mirrors this into `activeDoctorId` so the picker resolves the
   * pinned row from the SSR seed without any extra fetch.
   */
  forcedDoctorId?: string;
}

/**
 * F09 appointments list filter card. Lets the user narrow by department,
 * doctor, status, date range, and sort order. Pushes updates through the
 * URL so back/forward navigation works and shareable links carry the
 * active filter.
 *
 * Layout: 3-column responsive grid (collapses to single-column on `xs`).
 * Six cells, one per filter — all the same width regardless of widget
 * type so the card reads as a uniform grid rather than a row of
 * mismatched controls.
 *
 * Filter UX: each picker that has a "no value" state (department,
 * doctor, status, from-date, to-date) shows a small × button when a
 * value is set. Clicking × clears that filter's local state in-place.
 * The select-shaped pickers all consume the `clearable` prop on the
 * shared `<ClearableSelect>`-based wrappers (see
 * `components/shared/select/`); the date fields keep their own
 * `InputAdornment` clear path because they're built on `<TextField>`.
 * The order Select is excluded because asc/desc is always one or the
 * other.
 *
 * Every filter change resets `page=1` — landing on an out-of-range offset
 * after a filter change would render an empty page.
 */
export default function AppointmentListFilter({
  departments,
  doctorSeed,
  doctorScopeDepartmentId,
  activeDepartmentId,
  activeDoctorId,
  activeStatus,
  activeOrder,
  activeFrom,
  activeTo,
  departmentFilterDisabled,
  forcedDoctorId,
}: AppointmentListFilterProps) {
  const t = useTranslations(NS.AppointmentsFilters);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [departmentId, setDepartmentId] = useState<string>(
    activeDepartmentId ?? "",
  );
  const [status, setStatus] = useState<AppointmentStatusValue | "">(
    activeStatus ?? "",
  );
  const [order, setOrder] = useState<AppointmentListOrderValue>(activeOrder);
  const [from, setFrom] = useState<string>(activeFrom);
  const [to, setTo] = useState<string>(activeTo);

  // The doctor picker narrows by the user-picked `departmentId` when it
  // is set — falls back to the server-supplied scope (NURSE auto-narrow)
  // when no department is picked. Passed straight to `<DoctorSelect>`,
  // which owns the loader closure + reset-on-departmentId-change cascade.
  const doctorListDepartmentId = departmentId || doctorScopeDepartmentId;

  const initialDoctor =
    doctorSeed.data.find((d) => d.id === activeDoctorId) ?? null;
  const [doctor, setDoctor] = useState<DoctorListRow | null>(initialDoctor);

  // Track the last URL-resolved doctor so the sync effect only re-runs
  // when the URL value actually changes — not when the local doctor
  // state diverges from it (e.g. after we clear the doctor below on a
  // department change). Without this ref the sync effect and the
  // dept-cascade effect ping-pong indefinitely: sync writes the URL's
  // doctor back into state, then cascade clears it, repeat.
  const lastSyncedDoctorIdRef = useRef<string | null>(activeDoctorId);

  // Keep the selected doctor in sync with the URL when the user
  // navigates back/forward (the route re-renders the filter with a new
  // `activeDoctorId`). Resolves against the SSR seed's page-1 list for
  // the CURRENT URL — i.e. the server-narrowed page-1 fetch that matched
  // the active `activeDepartmentId` filter, so the URL's `activeDoctorId`
  // almost always lands inside. If the active doctor sits beyond page 1
  // the picker will resolve it after the user opens the dropdown and
  // scrolls; this matches the previous behaviour.
  //
  // This MUST be a `useEffect`, not a `useMemo` — `useMemo` is a value
  // calculator and calling `setState` from inside one is what tripped
  // the original "Maximum update depth" bug.
  useEffect(() => {
    if (lastSyncedDoctorIdRef.current === activeDoctorId) {
      return;
    }

    lastSyncedDoctorIdRef.current = activeDoctorId;
    setDoctor(doctorSeed.data.find((d) => d.id === activeDoctorId) ?? null);
  }, [activeDoctorId, doctorSeed]);

  // When the user changes department, if the picked doctor no longer
  // matches it, drop the doctor so the user doesn't submit a
  // `(department=A, doctor=fromDeptB)` filter that returns nothing.
  // Suppressed when the doctor is forced — the page's RBAC pinned the
  // picker to one row and we don't want a department flip to clear a
  // value the user can't re-select.
  useEffect(() => {
    if (!doctor || forcedDoctorId) {
      return;
    }

    if (departmentId && doctor.departmentId !== departmentId) {
      setDoctor(null);
    }
  }, [departmentId, doctor, forcedDoctorId]);

  // Doctor-first selection narrows the department dropdown to the
  // single department the picked doctor belongs to — prevents the user
  // from picking a `(department=A, doctor=fromDeptB)` pair that would
  // return an empty list. When no doctor is picked OR the department
  // filter is disabled (NURSE / DOCTOR — already pinned by the page),
  // the full catalog stays visible.
  const narrowedDepartments = useMemo(() => {
    if (departmentFilterDisabled || !doctor) {
      return departments;
    }

    const match = departments.find((d) => d.id === doctor.departmentId);

    if (!match) {
      return departments;
    }

    return [match];
  }, [departments, doctor, departmentFilterDisabled]);

  function buildSearch(): URLSearchParams {
    const search = new URLSearchParams();

    if (departmentId) {
      search.set(APPOINTMENT_QUERY_PARAM.DEPARTMENT_ID, departmentId);
    }

    if (doctor) {
      search.set(APPOINTMENT_QUERY_PARAM.DOCTOR_ID, doctor.id);
    }

    if (status) {
      search.set(APPOINTMENT_QUERY_PARAM.STATUS, status);
    }

    if (order && order !== APPOINTMENT_LIST_ORDER.ASC) {
      search.set(APPOINTMENT_QUERY_PARAM.ORDER, order);
    }

    if (from) {
      search.set(APPOINTMENT_QUERY_PARAM.FROM, from);
    }

    if (to) {
      search.set(APPOINTMENT_QUERY_PARAM.TO, to);
    }

    search.set(PAGINATION_QUERY_PARAM.PAGE, String(DEFAULT_PAGE));

    return search;
  }

  function handleApply() {
    const search = buildSearch();

    startTransition(() => {
      router.replace(`${FE_PATH.APPOINTMENTS}?${search.toString()}`);
    });
  }

  function handleReset() {
    setDepartmentId(departmentFilterDisabled ? departmentId : "");
    // Forced doctors (READ scope `.own` callers) stay pinned through a
    // Reset — clearing the locked id and then re-navigating to
    // `/appointments` would just re-pin it on the next render via
    // `activeDoctorId`. Keep the picker's local state aligned with
    // what the page is about to send back.
    setDoctor(forcedDoctorId ? doctor : null);
    setStatus("");
    setOrder(APPOINTMENT_LIST_ORDER.ASC);
    setFrom("");
    setTo("");

    startTransition(() => {
      router.replace(FE_PATH.APPOINTMENTS);
    });
  }

  const clearFieldLabel = t(K.Appointments.filters.clearField);

  // The text-input clear button (date filters). Renders only when
  // there's a value, suppressed otherwise. Wrapping in InputAdornment
  // keeps the IconButton inside the field's frame.
  function renderTextInputClearAdornment(
    visible: boolean,
    onClear: () => void,
  ) {
    if (!visible) {
      return undefined;
    }

    return (
      <InputAdornment position="end" sx={{ mr: 0.5 }}>
        <IconButton
          size="small"
          aria-label={clearFieldLabel}
          onClick={onClear}
          edge="end"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </InputAdornment>
    );
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1" fontWeight={600}>
            {t(K.Appointments.filters.title)}
          </Typography>

          {/*
            6-cell responsive grid. On `md+` the row breaks into three
            columns; below that everything stacks. Each cell uses
            `minmax(0, 1fr)` so the doctor picker (which sets its own
            min-width inside the Autocomplete) can't blow out the grid
            track and make sibling cells unequal.
          */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(3, minmax(0, 1fr))",
              },
              gap: 2,
            }}
          >
            <DepartmentSelect
              value={departmentId}
              onChange={setDepartmentId}
              departments={narrowedDepartments}
              label={t(K.Appointments.filters.department)}
              size="small"
              disabled={departmentFilterDisabled}
              clearable={!departmentFilterDisabled}
              clearAriaLabel={clearFieldLabel}
            />

            <Box sx={{ minWidth: 0 }}>
              <DoctorSelect
                value={doctor}
                onChange={(next) => setDoctor(next)}
                departmentId={doctorListDepartmentId}
                initial={doctorSeed}
                label={t(K.Appointments.filters.doctor)}
                placeholder={t(K.Appointments.filters.doctorPlaceholder)}
                size="small"
                clearable={!forcedDoctorId}
                disabled={Boolean(forcedDoctorId)}
              />
            </Box>

            <AppointmentStatusSelect
              value={status}
              onChange={setStatus}
              label={t(K.Appointments.filters.status)}
              size="small"
              clearable
              clearAriaLabel={clearFieldLabel}
            />

            <TextField
              type="date"
              size="small"
              label={t(K.Appointments.filters.from)}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: renderTextInputClearAdornment(Boolean(from), () =>
                  setFrom(""),
                ),
              }}
            />

            <TextField
              type="date"
              size="small"
              label={t(K.Appointments.filters.to)}
              value={to}
              onChange={(event) => setTo(event.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: renderTextInputClearAdornment(Boolean(to), () =>
                  setTo(""),
                ),
              }}
            />

            <OrderSelect
              value={order}
              onChange={setOrder}
              ascLabel={t(K.Appointments.filters.orderAsc)}
              descLabel={t(K.Appointments.filters.orderDesc)}
              label={t(K.Appointments.filters.order)}
              size="small"
            />
          </Box>

          <Stack
            direction={{ xs: "column-reverse", sm: "row" }}
            spacing={1.5}
            justifyContent="flex-end"
          >
            <Button
              type="button"
              variant="text"
              onClick={handleReset}
              disabled={isPending}
            >
              {t(K.Appointments.filters.reset)}
            </Button>
            <Button
              type="button"
              variant="contained"
              color="primary"
              onClick={handleApply}
              disabled={isPending}
            >
              {t(K.Appointments.filters.apply)}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
