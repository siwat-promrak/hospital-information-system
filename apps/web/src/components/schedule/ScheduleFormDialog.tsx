"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";

import SearchableSelect from "@/components/shared/SearchableSelect";
import { useRouter } from "@/i18n/navigation";
import { K, NS } from "@/i18n/keys.generated";
import { dayjs } from "@/lib/dayjs";
import { loadDoctorsPageAction } from "@/lib/api/doctor.actions";
import { DOCTOR_INFINITE_SCROLL_PAGE_SIZE } from "@/lib/api/doctor.const";
import {
  createScheduleAction,
  deleteScheduleAction,
  updateScheduleAction,
  type ScheduleActionError,
} from "@/lib/api/schedule.actions";
import { SCHEDULE_ERROR_CODE } from "@/lib/api/schedule.const";
import {
  combineDateAndTime,
  formatDate,
  parseISODatetime,
  todayLocalISODate,
  toISODateLocal,
  toLocalHHMM,
} from "@/lib/utils/date";
import { useNotify } from "@/lib/notifications/use-notify";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { isScheduleReadOnly } from "@/schedule/time";
import type { DoctorListRow } from "@/types/doctor.types";
import type { ScheduleResponse } from "@/types/schedule.types";

export interface ScheduleFormDialogPrefill {
  doctorId?: string;
  departmentId?: string;
  /** ISO `YYYY-MM-DD` date the user clicked on (local time). */
  date?: string;
  /** `HH:MM` start time (local) — defaults to `09:00` when omitted. */
  startTime?: string;
  /** `HH:MM` end time (local) — defaults to `17:00` when omitted. */
  endTime?: string;
  /**
   * When `true` (only set when create is opened from the day-details
   * dialog), the Date input is disabled so the user can't drift off the
   * day they explicitly chose. The other paths (header "+ Add", week
   * empty-cell click, mobile add-for-date) leave the date editable.
   */
  lockDate?: boolean;
}

interface ScheduleFormDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * First page of doctors fetched on the server when the page rendered.
   * Subsequent pages stream in via `loadDoctorsPageAction` as the user
   * scrolls the dropdown — see {@link DOCTOR_PAGE_SIZE}.
   */
  doctors: readonly DoctorListRow[];
  /**
   * Total number of doctor rows the BE would return for the current
   * `departmentId` filter. Used to drive the "Showing X of Y" hint inside
   * the dropdown and to decide when `hasMore` flips to `false`.
   */
  doctorsTotal: number;
  /**
   * The page the SSR `doctors` payload corresponds to (`1` for the
   * initial render). Threaded so the dialog knows the next page to
   * request when the user scrolls.
   */
  initialDoctorPage: number;
  /**
   * Optional department filter forwarded to `loadDoctorsPageAction` so
   * the incremental fetches stay scoped to the same subset the SSR call
   * used. `undefined` matches "all departments".
   */
  doctorDepartmentId?: string;
  /**
   * When set, the doctor field is fixed to this id and disabled — used on
   * `/me/schedule` so a DOCTOR caller can only create / edit their own rows.
   */
  lockedDoctorId?: string;
  /** Existing schedule to edit; `null` opens the dialog in create mode. */
  editing: ScheduleResponse | null;
  /**
   * Pre-fill values used on create. Sourced from the cell the user
   * clicked, so `date` arrives matching the clicked day.
   */
  prefill?: ScheduleFormDialogPrefill;
}

const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "17:00";
const DEFAULT_BREAK_START_TIME = "12:00";
const DEFAULT_BREAK_END_TIME = "13:00";

/**
 * Create / edit modal for a `ScheduleResponse`. Both modes share a single
 * form because the wire contract is the same (a PATCH is a partial create).
 * Validation runs locally before submit — the BE re-validates and the modal
 * surfaces typed errors (`SCHEDULE_OVERLAP`, `DOCTOR_NOT_IN_DEPARTMENT`)
 * inline so the user can fix without reloading.
 *
 * The wire contract carries `startAt` / `endAt` as ISO datetimes; the UI
 * splits them into a Date input + Start time + End time triplet so the
 * user doesn't have to keep two datetimes in sync. `combineDateAndTime`
 * collapses them back to ISO at submit time.
 */
export default function ScheduleFormDialog({
  open,
  onClose,
  doctors,
  doctorsTotal,
  initialDoctorPage,
  doctorDepartmentId,
  lockedDoctorId,
  editing,
  prefill,
}: ScheduleFormDialogProps) {
  const tForm = useTranslations(NS.SchedulesForm);
  const tErrors = useTranslations(NS.SchedulesErrors);
  const tSchedules = useTranslations(NS.Schedules);
  const locale = useLocale();
  const router = useRouter();
  const notify = useNotify();
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Incremental doctor list — starts from the SSR page-1 payload and
  // grows as the user scrolls the dropdown. Each tuple element is a
  // `DoctorListRow`. We dedupe by id at append time so a repeated
  // `loadMore` (StrictMode in dev, double-scroll race) can't introduce
  // duplicate rows. `loadedDoctors` is the source of truth for the
  // SearchableSelect options + the `selectedDoctor` lookup; whenever the
  // SSR `doctors` prop refreshes (e.g. user changes filter and the page
  // re-renders), the effect below resets the local cursor + list.
  const [loadedDoctors, setLoadedDoctors] = useState<readonly DoctorListRow[]>(
    doctors,
  );
  const [doctorPage, setDoctorPage] = useState<number>(initialDoctorPage);
  const [isLoadingMoreDoctors, setIsLoadingMoreDoctors] = useState<boolean>(false);
  // De-bounce flag so two near-simultaneous scroll callbacks (StrictMode,
  // momentum scroll) only kick off one fetch. `isLoadingMoreDoctors`
  // already guards via the SearchableSelect prop, but a guard at the
  // call site is cheaper than rerendering the dropdown.
  const fetchInFlight = useMemo(() => ({ current: false }), []);

  // Reset the incremental list whenever the SSR-provided list changes —
  // happens when the page re-renders with a new department filter, when
  // the dialog is reopened on a stale parent, or when a mutation
  // revalidates the page. `doctors` reference equality is stable per
  // server render, so this only fires on real changes.
  useEffect(() => {
    setLoadedDoctors(doctors);
    setDoctorPage(initialDoctorPage);
    setIsLoadingMoreDoctors(false);
    fetchInFlight.current = false;
  }, [doctors, initialDoctorPage, fetchInFlight]);

  const hasMoreDoctors = loadedDoctors.length < doctorsTotal;

  async function handleLoadMoreDoctors() {
    if (fetchInFlight.current || !hasMoreDoctors) {
      return;
    }

    fetchInFlight.current = true;
    setIsLoadingMoreDoctors(true);

    try {
      const nextPage = doctorPage + 1;
      const response = await loadDoctorsPageAction({
        page: nextPage,
        pageSize: DOCTOR_INFINITE_SCROLL_PAGE_SIZE,
        departmentId: doctorDepartmentId,
      });

      // Append + dedupe — keeps the list stable if the BE shifts a row
      // between pages (a doctor added between the SSR call and the
      // incremental fetch). Existing entries win so the in-place
      // `selectedDoctor` reference doesn't churn.
      setLoadedDoctors((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        const additions = response.data.filter((d) => !seen.has(d.id));

        return [...prev, ...additions];
      });
      setDoctorPage(nextPage);
    } catch {
      // Swallow — the dropdown stays at its current page and the user
      // can keep typing / scrolling. We don't want a transient network
      // hiccup to surface a blocking error inside a modal that's
      // primarily about scheduling, not directory browsing.
    } finally {
      setIsLoadingMoreDoctors(false);
      fetchInFlight.current = false;
    }
  }

  const [doctorId, setDoctorId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [date, setDate] = useState<string>(todayLocalISODate());
  const [startTime, setStartTime] = useState<string>(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState<string>(DEFAULT_END_TIME);
  const [hasBreak, setHasBreak] = useState<boolean>(false);
  const [breakStart, setBreakStart] = useState<string>(DEFAULT_BREAK_START_TIME);
  const [breakEnd, setBreakEnd] = useState<string>(DEFAULT_BREAK_END_TIME);
  const [acceptsBooking, setAcceptsBooking] = useState<boolean>(true);

  const [topError, setTopError] = useState<string | null>(null);
  const [departmentError, setDepartmentError] = useState<string | null>(null);

  // Reset form state every time the dialog opens with a new editing target or
  // prefill — the dialog is kept mounted across opens so React stale state
  // would otherwise leak between sessions.
  useEffect(() => {
    if (!open) {
      return;
    }

    setTopError(null);
    setDepartmentError(null);
    setConfirmingDelete(false);

    if (editing) {
      const start = parseISODatetime(editing.startAt);
      const end = parseISODatetime(editing.endAt);
      const breakStartDate = editing.breakStartAt
        ? parseISODatetime(editing.breakStartAt)
        : null;
      const breakEndDate = editing.breakEndAt
        ? parseISODatetime(editing.breakEndAt)
        : null;

      setDoctorId(editing.doctorId);
      setDepartmentId(editing.departmentId);
      setDate(start ? toISODateLocal(start) : todayLocalISODate());
      setStartTime(start ? toLocalHHMM(start) : DEFAULT_START_TIME);
      setEndTime(end ? toLocalHHMM(end) : DEFAULT_END_TIME);

      const editingHasBreak = breakStartDate !== null && breakEndDate !== null;
      setHasBreak(editingHasBreak);
      setBreakStart(
        editingHasBreak ? toLocalHHMM(breakStartDate!) : DEFAULT_BREAK_START_TIME,
      );
      setBreakEnd(
        editingHasBreak ? toLocalHHMM(breakEndDate!) : DEFAULT_BREAK_END_TIME,
      );
      setAcceptsBooking(editing.acceptsBooking);

      return;
    }

    // Create mode — start from the prefill (the cell the user clicked).
    setDoctorId(lockedDoctorId ?? "");
    setDepartmentId(prefill?.departmentId ?? "");
    setDate(prefill?.date ?? todayLocalISODate());
    setStartTime(prefill?.startTime ?? DEFAULT_START_TIME);
    setEndTime(prefill?.endTime ?? DEFAULT_END_TIME);
    setHasBreak(false);
    setBreakStart(DEFAULT_BREAK_START_TIME);
    setBreakEnd(DEFAULT_BREAK_END_TIME);
    setAcceptsBooking(true);
  }, [open, editing, lockedDoctorId, prefill]);

  // The selected doctor's affiliated departments power the department
  // dropdown. When the doctor changes, default the department to the new
  // doctor's primary (or first) affiliation if the current selection is no
  // longer valid. Looks up across `loadedDoctors` (the incrementally-grown
  // list) so a selected doctor stays resolved even after more pages load.
  const selectedDoctor = useMemo(
    () => loadedDoctors.find((d) => d.id === doctorId) ?? null,
    [loadedDoctors, doctorId],
  );

  const availableDepartments = useMemo(
    () => selectedDoctor?.departments ?? [],
    [selectedDoctor],
  );

  useEffect(() => {
    if (!selectedDoctor) {
      return;
    }

    const stillValid = availableDepartments.some(
      (aff) => aff.departmentId === departmentId,
    );

    if (stillValid) {
      return;
    }

    const primary =
      availableDepartments.find((aff) => aff.isPrimary) ??
      availableDepartments[0];
    setDepartmentId(primary?.departmentId ?? "");
  }, [selectedDoctor, availableDepartments, departmentId]);

  /**
   * Server-side error handler. Field-level errors that point at a specific
   * input (`DOCTOR_NOT_IN_DEPARTMENT` → department select) stay inline so
   * the user sees the red helper text directly under the field. Everything
   * else surfaces via the app-wide snackbar so the user gets an
   * unambiguous "this didn't save" signal even when the modal is scrolled.
   */
  function applyServerError(error: ScheduleActionError): void {
    setTopError(null);
    setDepartmentError(null);

    if (error.code === SCHEDULE_ERROR_CODE.DOCTOR_NOT_IN_DEPARTMENT) {
      setDepartmentError(tErrors(K.Schedules.Errors.doctorNotInDepartment));

      return;
    }

    // `useNotify` maps the wire code via `ERROR_CODE_TO_KEY`; unmapped
    // codes fall through to the generic snackbar copy. We pass the
    // module-scoped generic message as the fallback so the user gets a
    // schedules-aware message instead of the global generic copy when
    // possible.
    notify.error(error.code, tErrors(K.Schedules.Errors.generic));
  }

  function validateLocally(): {
    ok: boolean;
    startAt?: string;
    endAt?: string;
    breakStartAt?: string;
    breakEndAt?: string;
  } {
    setTopError(null);
    setDepartmentError(null);

    if (!doctorId) {
      setTopError(tErrors(K.Schedules.Errors.missingDoctor));

      return { ok: false };
    }

    if (!departmentId) {
      setDepartmentError(tErrors(K.Schedules.Errors.missingDepartment));

      return { ok: false };
    }

    if (!date) {
      setTopError(tErrors(K.Schedules.Errors.missingDate));

      return { ok: false };
    }

    const startAt = combineDateAndTime(date, startTime);
    const endAt = combineDateAndTime(date, endTime);

    if (!startAt || !endAt) {
      setTopError(tErrors(K.Schedules.Errors.invalidDateTime));

      return { ok: false };
    }

    // Past-date guard for create mode — the BE rejects with
    // `SCHEDULE_START_IN_PAST` but surfacing the inline error first lets
    // the user fix the obvious mistake without burning a round-trip.
    // Skipped in edit mode because the existing schedule's date is locked
    // anyway (the user can't edit it from this surface).
    if (!editing && dayjs(startAt).isBefore(dayjs())) {
      setTopError(tErrors(K.Schedules.Errors.startInPast));

      return { ok: false };
    }

    if (dayjs(endAt).isSameOrBefore(dayjs(startAt))) {
      setTopError(tErrors(K.Schedules.Errors.endBeforeStart));

      return { ok: false };
    }

    if (!hasBreak) {
      return { ok: true, startAt, endAt };
    }

    const breakStartAt = combineDateAndTime(date, breakStart);
    const breakEndAt = combineDateAndTime(date, breakEnd);

    if (!breakStartAt || !breakEndAt) {
      setTopError(tErrors(K.Schedules.Errors.invalidDateTime));

      return { ok: false };
    }

    if (dayjs(breakEndAt).isSameOrBefore(dayjs(breakStartAt))) {
      setTopError(tErrors(K.Schedules.Errors.breakInvalid));

      return { ok: false };
    }

    if (
      dayjs(breakStartAt).isBefore(dayjs(startAt)) ||
      dayjs(breakEndAt).isAfter(dayjs(endAt))
    ) {
      setTopError(tErrors(K.Schedules.Errors.breakOutsideWindow));

      return { ok: false };
    }

    return { ok: true, startAt, endAt, breakStartAt, breakEndAt };
  }

  function handleSubmit() {
    const validation = validateLocally();

    if (!validation.ok) {
      return;
    }

    const body = {
      departmentId,
      startAt: validation.startAt!,
      endAt: validation.endAt!,
      breakStartAt: validation.breakStartAt,
      breakEndAt: validation.breakEndAt,
      acceptsBooking,
    };

    startTransition(async () => {
      if (editing) {
        const result = await updateScheduleAction(editing.id, body);

        if (!result.ok) {
          applyServerError(result.error);

          return;
        }

        notify.success(SNACKBAR_SUCCESS_KEY.SCHEDULE_UPDATED);
        onClose();
        router.refresh();

        return;
      }

      const result = await createScheduleAction({ doctorId, ...body });

      if (!result.ok) {
        applyServerError(result.error);

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.SCHEDULE_CREATED);
      onClose();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!editing) {
      return;
    }

    startTransition(async () => {
      const result = await deleteScheduleAction(editing.id);

      if (!result.ok) {
        applyServerError(result.error);

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.SCHEDULE_DELETED);
      onClose();
      router.refresh();
    });
  }

  const isEdit = Boolean(editing);
  // Past schedules (`endAt <= now`) render in read-only mode: every input is
  // disabled, the Save + Delete buttons are hidden, and an info banner at the
  // top of the dialog explains why. The cutoff is client-local — this is a
  // UX guard, not a security guarantee (the BE remains the authority).
  // `useMemo` recomputes only when the editing target changes; "now" is
  // captured at the same time so a long-open dialog doesn't flip mid-session.
  const readOnly = useMemo(
    () => (editing ? isScheduleReadOnly(editing) : false),
    [editing],
  );
  const inputsDisabled = isPending || readOnly;
  // Edit mode locks the identity fields (doctor / department / date) — a
  // change there isn't really an "edit", it's a "delete + create new",
  // and the BE's overlap + affiliation checks make those changes much
  // safer to express as two explicit actions. Past schedules already
  // show the read-only banner, so the edit-locked notice would be
  // redundant in that case.
  const isEditLocked = isEdit && !readOnly;
  // Date input is also locked when the create came from the day-details
  // dialog — the user already chose the day in the surface that opened
  // this modal, and a silent in-modal date drift would be a bug surface.
  const isDateLocked = isEdit || Boolean(prefill?.lockDate);
  const dateInputDisabled = inputsDisabled || isDateLocked;
  // Native date-picker `min` is today's local date so past days are
  // greyed out in the picker UI in create mode. Edit mode keeps the
  // input disabled (above), so `min` only matters here for create.
  const today = todayLocalISODate();
  const lockedDateLabel = useMemo(() => {
    if (!isDateLocked) {
      return "";
    }

    const parsed = dayjs(date, "YYYY-MM-DD", true);

    if (!parsed.isValid()) {
      return "";
    }

    return formatDate(parsed.toDate(), locale);
  }, [date, isDateLocked, locale]);
  const title = isEdit
    ? tForm(K.Schedules.Form.editTitle)
    : tForm(K.Schedules.Form.createTitle);

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>{title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {readOnly ? (
              <Alert severity="info" role="status">
                <strong>{tSchedules(K.Schedules.readOnlyTitle)}</strong>
                <Box component="div" sx={{ mt: 0.25 }}>
                  {tSchedules(K.Schedules.readOnlyBody)}
                </Box>
              </Alert>
            ) : null}

            {/* Edit-mode lock notice — only shown when NOT already in
                read-only mode (the read-only banner above supersedes it). */}
            {isEditLocked ? (
              <Alert severity="info" role="status">
                {tForm(K.Schedules.Form.editLockedNotice)}
              </Alert>
            ) : null}

            {topError ? <Alert severity="error">{topError}</Alert> : null}

            <SearchableSelect<DoctorListRow>
              value={selectedDoctor}
              onChange={(next) => setDoctorId(next?.id ?? "")}
              options={loadedDoctors}
              loadMore={handleLoadMoreDoctors}
              hasMore={hasMoreDoctors}
              isLoading={isLoadingMoreDoctors}
              hasMoreLabel={tForm(K.Schedules.Form.doctorShowingCount, {
                loaded: loadedDoctors.length,
                total: doctorsTotal,
              })}
              loadingMoreLabel={tForm(K.Schedules.Form.doctorLoadingMore)}
              searchScopedHint={tForm(K.Schedules.Form.doctorSearchScopedHint)}
              getOptionLabel={(option) =>
                `${option.fullName} (${option.doctorCode})`
              }
              getOptionKey={(option) => option.id}
              renderOption={(option) => {
                // Primary-first ordering for the subtitle. The BE may return
                // affiliations in any order, but the rendered string MUST put
                // the primary department first so the visual emphasis (bold)
                // lands on the dominant affiliation regardless of input order.
                const sortedDepartments = [...option.departments].sort(
                  (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
                );

                return (
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
                    {sortedDepartments.length > 0 ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ whiteSpace: "normal" }}
                      >
                        {sortedDepartments.map((aff, index) => (
                          <Box
                            key={aff.departmentId}
                            component="span"
                            sx={{ fontWeight: aff.isPrimary ? 600 : 400 }}
                          >
                            {index > 0 ? ", " : ""}
                            {aff.departmentName}
                          </Box>
                        ))}
                      </Typography>
                    ) : null}
                  </Box>
                );
              }}
              label={tForm(K.Schedules.Form.doctor)}
              placeholder={tForm(K.Schedules.Form.doctorPlaceholder)}
              noOptionsText={tForm(K.Schedules.Form.doctorNoMatches)}
              required
              disabled={Boolean(lockedDoctorId) || inputsDisabled || isEdit}
            />

            <FormControl
              fullWidth
              error={Boolean(departmentError)}
              disabled={
                inputsDisabled || isEdit || availableDepartments.length === 0
              }
            >
              <InputLabel id="schedule-form-department">
                {tForm(K.Schedules.Form.department)}
              </InputLabel>
              <Select
                labelId="schedule-form-department"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                label={tForm(K.Schedules.Form.department)}
              >
                {availableDepartments.map((aff) => (
                  <MenuItem key={aff.departmentId} value={aff.departmentId}>
                    {aff.departmentName}
                  </MenuItem>
                ))}
              </Select>
              {departmentError ? (
                <Box sx={{ mt: 0.5, ml: 1.5 }}>
                  <Alert severity="error" sx={{ py: 0 }}>
                    {departmentError}
                  </Alert>
                </Box>
              ) : null}
            </FormControl>

            <TextField
              label={tForm(K.Schedules.Form.date)}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              // `min` greys out past days in the native date-picker. Only
              // applied in create mode — edit mode disables the input
              // outright, and the existing date may pre-date `today`.
              inputProps={isEdit ? undefined : { min: today }}
              fullWidth
              required
              disabled={dateInputDisabled}
              helperText={
                isDateLocked && !isEdit && lockedDateLabel
                  ? tForm(K.Schedules.Form.dateLockedHelper, {
                      date: lockedDateLabel,
                    })
                  : undefined
              }
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label={tForm(K.Schedules.Form.startTime)}
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 300 }}
                fullWidth
                disabled={inputsDisabled}
              />
              <TextField
                label={tForm(K.Schedules.Form.endTime)}
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 300 }}
                fullWidth
                disabled={inputsDisabled}
              />
            </Stack>

            <FormControlLabel
              control={
                <Checkbox
                  checked={hasBreak}
                  onChange={(event) => setHasBreak(event.target.checked)}
                  disabled={inputsDisabled}
                />
              }
              label={tForm(K.Schedules.Form.hasBreak)}
            />

            {hasBreak ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label={tForm(K.Schedules.Form.breakStartTime)}
                  type="time"
                  value={breakStart}
                  onChange={(event) => setBreakStart(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ step: 300 }}
                  fullWidth
                  disabled={inputsDisabled}
                />
                <TextField
                  label={tForm(K.Schedules.Form.breakEndTime)}
                  type="time"
                  value={breakEnd}
                  onChange={(event) => setBreakEnd(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ step: 300 }}
                  fullWidth
                  disabled={inputsDisabled}
                />
              </Stack>
            ) : null}

            <FormControlLabel
              control={
                <Checkbox
                  checked={acceptsBooking}
                  onChange={(event) => setAcceptsBooking(event.target.checked)}
                  disabled={inputsDisabled}
                />
              }
              label={tForm(K.Schedules.Form.acceptsBooking)}
            />
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            // Read-only mode hides both Save AND Delete, leaving only Close —
            // right-align the lone Close button instead of leaving an empty
            // gap where the Delete button used to sit.
            justifyContent: isEdit && !readOnly ? "space-between" : "flex-end",
            px: 3,
            py: 2,
          }}
        >
          {isEdit && !readOnly ? (
            <Button
              color="error"
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
            >
              {tForm(K.Schedules.Form.delete)}
            </Button>
          ) : null}
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose} disabled={isPending}>
              {tForm(K.Schedules.Form.cancel)}
            </Button>
            {!readOnly ? (
              <Button
                onClick={handleSubmit}
                variant="contained"
                disabled={isPending}
              >
                {isEdit
                  ? tForm(K.Schedules.Form.save)
                  : tForm(K.Schedules.Form.create)}
              </Button>
            ) : null}
          </Stack>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
      >
        <DialogTitle>
          {tForm(K.Schedules.Form.deleteConfirmTitle)}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {tForm(K.Schedules.Form.deleteConfirmBody)}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmingDelete(false)}
            disabled={isPending}
          >
            {tForm(K.Schedules.Form.deleteCancel)}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={isPending}
          >
            {tForm(K.Schedules.Form.deleteConfirm)}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
