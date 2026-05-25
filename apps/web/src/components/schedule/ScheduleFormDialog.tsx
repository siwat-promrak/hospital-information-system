"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { Controller, useForm } from "react-hook-form";

import SearchableSelect from "@/components/shared/SearchableSelect";
import { formatScheduleDoctorName } from "@/doctor/format";
import { useRouter } from "@/i18n/navigation";
import { K, NS } from "@/i18n/keys.generated";
import { dayjs } from "@/lib/dayjs";
import {
  createScheduleAction,
  deleteScheduleAction,
  updateScheduleAction,
  type ScheduleActionError,
} from "@/lib/api/schedule.actions";
import { SCHEDULE_ERROR_CODE } from "@/lib/api/schedule.const";
import { useIncrementalDoctorList } from "@/lib/api/use-incremental-doctor-list";
import {
  scheduleFormSchema,
  type ScheduleFormValues,
} from "@/schedule/form-schema";
import type { ScheduleFormErrorKey } from "@/schedule/form-schema.const";
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
   * Subsequent pages stream in via `useIncrementalDoctorList` as the user
   * scrolls the dropdown.
   */
  doctors: readonly DoctorListRow[];
  /**
   * Total number of doctor rows the BE would return for the current
   * `departmentId` filter. Drives the "Showing X of Y" hint inside the
   * dropdown and the `hasMore` flip.
   */
  doctorsTotal: number;
  /**
   * The page the SSR `doctors` payload corresponds to (`1` for the
   * initial render). Threaded so the hook knows the next page to request
   * when the user scrolls.
   */
  initialDoctorPage: number;
  /**
   * Optional department filter forwarded to incremental fetches so the
   * paged results stay scoped to the same subset the SSR call used.
   * `undefined` matches "all departments".
   */
  doctorDepartmentId?: string;
  /**
   * When set, the doctor field is fixed to this id and disabled — used on
   * `/schedules` in mode `"own"` / `"own+dept"` (DOCTOR caller with the
   * "Show mine" toggle on) so the caller can only create / edit their
   * own rows.
   */
  lockedDoctorId?: string;
  /**
   * `true` when the caller is operating on a wider surface than their
   * write scope allows (DOCTOR viewing OWN_PLUS_DEPT + "dept" with only
   * `.own`). Combined with `lockedDoctorId`, this hides the Save / Delete
   * buttons for any schedule whose `doctorId !== lockedDoctorId` so the
   * caller can inspect a colleague's row but not mutate it.
   */
  createsLockedToCaller: boolean;
  /**
   * Caller's own `Doctor.id`. Used only when `createsLockedToCaller`
   * is true — together they decide whether the current `editing` row is
   * mutable by the caller.
   */
  callerDoctorId?: string;
  /**
   * Gates the "Delete" button at the bottom of the edit dialog. When
   * `false` the button does not render — used when the caller can
   * UPDATE rows on the active surface but not DELETE them (rare today;
   * exists so future split permissions don't accidentally expose a
   * delete affordance the BE would reject).
   */
  canDelete: boolean;
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
 *
 * Client-side validation runs through a `zod` schema wired into
 * `react-hook-form` via `zodResolver`. Each `<TextField>` (and the
 * `<SearchableSelect>` for the doctor picker) registers with the form and
 * surfaces a per-field error string in its own `helperText` — no more
 * top-of-form alert for client-side validation. The top `<Alert>` is now
 * reserved for SERVER-side errors only (network failure, BE 4xx where the
 * code can't be narrowed to a specific field).
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
  createsLockedToCaller,
  callerDoctorId,
  canDelete,
  editing,
  prefill,
}: ScheduleFormDialogProps) {
  const tForm = useTranslations(NS.SchedulesForm);
  const tFieldErrors = useTranslations(NS.SchedulesFormFieldErrors);
  const tErrors = useTranslations(NS.SchedulesErrors);
  const tSchedules = useTranslations(NS.Schedules);
  const locale = useLocale();
  const router = useRouter();
  const notify = useNotify();
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Incremental doctor list — starts from the SSR page-1 payload and
  // grows as the user scrolls the dropdown. The shared hook owns the
  // dedup-on-append + reset-on-prop-change semantics so the form dialog
  // and the page-level `ScheduleDoctorFilter` stay aligned.
  const {
    loaded: loadedDoctors,
    isLoadingMore: isLoadingMoreDoctors,
    hasMore: hasMoreDoctors,
    loadMore: handleLoadMoreDoctors,
  } = useIncrementalDoctorList({
    initialDoctors: doctors,
    total: doctorsTotal,
    initialPage: initialDoctorPage,
    departmentId: doctorDepartmentId,
  });

  const isEdit = Boolean(editing);

  // The Zod schema branches on edit vs create — past-start guard is a
  // create-only concern; an existing schedule may legitimately have started
  // already (`startAt < now`) and edit-mode UX would otherwise be unable to
  // flip `acceptsBooking` on such rows.
  const schemaInstance = useMemo(
    () => scheduleFormSchema({ skipPastStartGuard: isEdit }),
    [isEdit],
  );

  const {
    control,
    handleSubmit: rhfHandleSubmit,
    register,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting: rhfIsSubmitting },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(schemaInstance),
    mode: "onBlur",
    defaultValues: {
      doctorId: "",
      departmentId: "",
      date: todayLocalISODate(),
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
      hasBreak: false,
      breakStartTime: DEFAULT_BREAK_START_TIME,
      breakEndTime: DEFAULT_BREAK_END_TIME,
      acceptsBooking: true,
    },
  });

  const watchedDoctorId = watch("doctorId");
  const watchedHasBreak = watch("hasBreak");
  const watchedDate = watch("date");

  // Server-side error state (post-submit BE 4xx). Field-level errors
  // (`DOCTOR_NOT_IN_DEPARTMENT`) still land on the matching input via
  // `react-hook-form`'s `setError`; everything else surfaces here as a top
  // Alert so a network failure or `SCHEDULE_OVERLAP` still gets a banner.
  const [serverError, setServerError] = useState<string | null>(null);
  const [departmentServerError, setDepartmentServerError] = useState<
    string | null
  >(null);

  // Reset form state every time the dialog opens with a new editing target or
  // prefill — the dialog is kept mounted across opens so React stale state
  // would otherwise leak between sessions.
  useEffect(() => {
    if (!open) {
      return;
    }

    setServerError(null);
    setDepartmentServerError(null);
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

      const editingHasBreak = breakStartDate !== null && breakEndDate !== null;

      reset({
        doctorId: editing.doctorId,
        departmentId: editing.departmentId,
        date: start ? toISODateLocal(start) : todayLocalISODate(),
        startTime: start ? toLocalHHMM(start) : DEFAULT_START_TIME,
        endTime: end ? toLocalHHMM(end) : DEFAULT_END_TIME,
        hasBreak: editingHasBreak,
        breakStartTime: editingHasBreak
          ? toLocalHHMM(breakStartDate!)
          : DEFAULT_BREAK_START_TIME,
        breakEndTime: editingHasBreak
          ? toLocalHHMM(breakEndDate!)
          : DEFAULT_BREAK_END_TIME,
        acceptsBooking: editing.acceptsBooking,
      });

      return;
    }

    // Create mode — start from the prefill (the cell the user clicked).
    reset({
      doctorId: lockedDoctorId ?? "",
      departmentId: prefill?.departmentId ?? "",
      date: prefill?.date ?? todayLocalISODate(),
      startTime: prefill?.startTime ?? DEFAULT_START_TIME,
      endTime: prefill?.endTime ?? DEFAULT_END_TIME,
      hasBreak: false,
      breakStartTime: DEFAULT_BREAK_START_TIME,
      breakEndTime: DEFAULT_BREAK_END_TIME,
      acceptsBooking: true,
    });
  }, [open, editing, lockedDoctorId, prefill, reset]);

  // The selected doctor's department powers the department field. After
  // the RBAC refactor a doctor belongs to exactly one department, so the
  // picker collapses to a single, fixed entry — when the doctor changes,
  // the department auto-pins to that doctor's department. Looks up across
  // `loadedDoctors` (the incrementally-grown list) so a selected doctor
  // stays resolved even after more pages load.
  //
  // Fallback path: when EDITING a schedule whose doctor isn't in the
  // loaded list (the SSR fetch is paginated, so doctors past page 1
  // aren't streamed in until the picker scrolls), synthesize a thin
  // `DoctorListRow` from the schedule's embedded `doctor` + `department`
  // refs. The picker is `disabled={isEdit}` so the synthetic row never
  // has to power search / dropdown rendering — it only needs to supply
  // the label + department for the disabled fields above. Without this
  // the form would render a blank doctor name and blank department for
  // any schedule whose doctor sits beyond `DOCTOR_INFINITE_SCROLL_PAGE_SIZE`.
  const selectedDoctor = useMemo<DoctorListRow | null>(() => {
    const found = loadedDoctors.find((d) => d.id === watchedDoctorId);

    if (found) {
      return found;
    }

    if (editing && editing.doctorId === watchedDoctorId) {
      return {
        id: editing.doctor.id,
        doctorCode: editing.doctor.doctorCode,
        firstNameEn: editing.doctor.firstNameEn,
        lastNameEn: editing.doctor.lastNameEn,
        fullName: formatScheduleDoctorName(locale, editing.doctor),
        // `ScheduleDoctorRef` deliberately omits `gender` (the calendar
        // doesn't need it). `null` is the documented fallback in
        // `DoctorListRow`, so the synthetic row stays type-safe.
        gender: null,
        departmentId: editing.departmentId,
        department: {
          id: editing.department.id,
          name: editing.department.name,
        },
      };
    }

    return null;
  }, [loadedDoctors, watchedDoctorId, editing, locale]);

  useEffect(() => {
    if (!selectedDoctor) {
      return;
    }

    setValue("departmentId", selectedDoctor.departmentId, {
      shouldValidate: false,
      shouldDirty: false,
    });
  }, [selectedDoctor, setValue]);

  /**
   * Server-side error handler. Field-level errors that point at a specific
   * input (`DOCTOR_NOT_IN_DEPARTMENT` → department select) stay inline so
   * the user sees the red helper text directly under the field. Everything
   * else surfaces via the top Alert (and the app-wide snackbar) so the
   * user gets an unambiguous "this didn't save" signal even when the modal
   * is scrolled.
   */
  function applyServerError(error: ScheduleActionError): void {
    setServerError(null);
    setDepartmentServerError(null);

    if (error.code === SCHEDULE_ERROR_CODE.DOCTOR_NOT_IN_DEPARTMENT) {
      setDepartmentServerError(
        tErrors(K.Schedules.Errors.doctorNotInDepartment),
      );

      return;
    }

    // `useNotify` maps the wire code via `ERROR_CODE_TO_KEY`; unmapped
    // codes fall through to the generic snackbar copy. We mirror the same
    // message into the top Alert so the user sees it even if they
    // dismissed the snackbar.
    const fallback = tErrors(K.Schedules.Errors.generic);

    setServerError(fallback);
    notify.error(error.code, fallback);
  }

  function onValidSubmit(values: ScheduleFormValues) {
    const startAt = combineDateAndTime(values.date, values.startTime);
    const endAt = combineDateAndTime(values.date, values.endTime);

    if (!startAt || !endAt) {
      // Defensive — schema already guards this. Surface a generic top
      // alert so the user gets feedback if the combiner somehow fails on
      // shape that passed the schema.
      setServerError(tErrors(K.Schedules.Errors.invalidDateTime));

      return;
    }

    const breakStartAt = values.hasBreak
      ? (combineDateAndTime(values.date, values.breakStartTime) ?? undefined)
      : undefined;
    const breakEndAt = values.hasBreak
      ? (combineDateAndTime(values.date, values.breakEndTime) ?? undefined)
      : undefined;

    const body = {
      departmentId: values.departmentId,
      startAt,
      endAt,
      breakStartAt,
      breakEndAt,
      acceptsBooking: values.acceptsBooking,
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

      const result = await createScheduleAction({
        doctorId: values.doctorId,
        ...body,
      });

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
  // Combined "submitting" flag — react-hook-form's own + the React
  // useTransition started by the server-action call. The submit button
  // gates on the union so a re-click during the BE round-trip can't
  // double-fire.
  const isSubmitting = isPending || rhfIsSubmitting;
  // Per-row mutability check for the locked-to-caller surface
  // (DOCTOR in OWN_PLUS_DEPT + "dept"). Computed BEFORE `inputsDisabled`
  // so it can short-circuit input editability the same way `readOnly`
  // does. The caller can open ANY chip to inspect it, but only their own
  // schedules surface Save / Delete buttons — `editing.doctorId ===
  // callerDoctorId` gates both. New rows (`editing === null`) always
  // pass because the create dialog enforces the lock via the disabled
  // picker AND `lockedDoctorId`.
  const isEditingOwnRow =
    !editing ||
    !createsLockedToCaller ||
    (callerDoctorId !== undefined && editing.doctorId === callerDoctorId);
  const inputsDisabled = isSubmitting || readOnly || !isEditingOwnRow;
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

    const parsed = dayjs(watchedDate, "YYYY-MM-DD", true);

    if (!parsed.isValid()) {
      return "";
    }

    return formatDate(parsed.toDate(), locale);
  }, [watchedDate, isDateLocked, locale]);
  const title = isEdit
    ? tForm(K.Schedules.Form.editTitle)
    : tForm(K.Schedules.Form.createTitle);

  // The "view only" notice fires when the dialog is open on someone
  // else's schedule under the lock. Mutually exclusive with read-only
  // (which dominates for past rows). `isEditingOwnRow` was computed
  // earlier so it could feed into `inputsDisabled`.
  const showViewOnlyNotice = isEdit && !readOnly && !isEditingOwnRow;
  // Lock the doctor picker when:
  //   - explicit `lockedDoctorId` was passed (caller pinned to a doctor)
  //   - editing an existing row (doctor is not mutable on PATCH anyway)
  //   - the surface is `createsLockedToCaller` (DOCTOR fallback)
  const doctorPickerDisabled =
    Boolean(lockedDoctorId) ||
    inputsDisabled ||
    isEdit ||
    createsLockedToCaller;

  // i18n lookup for the per-field error key the Zod schema emits. The
  // schema returns the leaf key (e.g. `"endBeforeStart"`); the lookup
  // table flips it into localised copy via `tFieldErrors`. The Zod
  // `message` field is typed as `string` at the framework level — we
  // narrow back to the `K.Schedules.Form.fieldErrors.*` union via the
  // `ScheduleFormErrorKey` catalog so the next-intl call stays type-safe.
  function errorMessage(errorKey: string | undefined): string | undefined {
    if (!errorKey) {
      return undefined;
    }

    return tFieldErrors(errorKey as ScheduleFormErrorKey);
  }

  // Save / Delete affordances. The locked-to-caller path collapses both to
  // false on someone else's row so the user can only inspect it.
  const showSaveButton = !readOnly && isEditingOwnRow;
  const showDeleteButton =
    isEdit && !readOnly && canDelete && isEditingOwnRow;

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>{title}</DialogTitle>
        <DialogContent dividers>
          <Box
            component="form"
            id="schedule-form"
            onSubmit={rhfHandleSubmit(onValidSubmit)}
            noValidate
          >
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
              {isEditLocked && isEditingOwnRow ? (
                <Alert severity="info" role="status">
                  {tForm(K.Schedules.Form.editLockedNotice)}
                </Alert>
              ) : null}

              {/* View-only banner — fires when a DOCTOR has opened a
                  colleague's chip under `createsLockedToCaller`. The form
                  inputs stay populated for inspection but Save / Delete
                  hide entirely. */}
              {showViewOnlyNotice ? (
                <Alert severity="info" role="status">
                  {tForm(K.Schedules.Form.viewOnlyOtherDoctor)}
                </Alert>
              ) : null}

              {/* Server-error alert — reserved for BE 4xx / network
                  failures. Client-side per-field errors render under
                  their owning input via Zod + react-hook-form. */}
              {serverError ? (
                <Alert severity="error">{serverError}</Alert>
              ) : null}

              <Controller
                control={control}
                name="doctorId"
                render={({ field, fieldState }) => (
                  <SearchableSelect<DoctorListRow>
                    value={selectedDoctor}
                    onChange={(next) => field.onChange(next?.id ?? "")}
                    options={loadedDoctors}
                    loadMore={handleLoadMoreDoctors}
                    hasMore={hasMoreDoctors}
                    isLoading={isLoadingMoreDoctors}
                    hasMoreLabel={tForm(K.Schedules.Form.doctorShowingCount, {
                      loaded: loadedDoctors.length,
                      total: doctorsTotal,
                    })}
                    loadingMoreLabel={tForm(K.Schedules.Form.doctorLoadingMore)}
                    searchScopedHint={tForm(
                      K.Schedules.Form.doctorSearchScopedHint,
                    )}
                    getOptionLabel={(option) =>
                      `${option.fullName} (${option.doctorCode})`
                    }
                    getOptionKey={(option) => option.id}
                    renderOption={(option) => (
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          py: 0.25,
                        }}
                      >
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
                    label={tForm(K.Schedules.Form.doctor)}
                    placeholder={tForm(K.Schedules.Form.doctorPlaceholder)}
                    noOptionsText={tForm(K.Schedules.Form.doctorNoMatches)}
                    required
                    disabled={doctorPickerDisabled}
                    error={Boolean(fieldState.error)}
                    helperText={
                      errorMessage(fieldState.error?.message) ??
                      (createsLockedToCaller && !isEdit
                        ? tForm(K.Schedules.Form.lockedToCallerHint)
                        : undefined)
                    }
                  />
                )}
              />

              {/* Department field — auto-derived from the selected doctor
                  and never user-editable, so we don't register a picker.
                  The form value lives in react-hook-form's state via
                  `setValue("departmentId", ...)` in the doctor-change
                  effect; this control is purely visual. Schema errors on
                  `departmentId` are exceptionally rare (the auto-fill keeps
                  the value valid) but we still surface them in the helper
                  slot for defensiveness. */}
              <FormControl
                fullWidth
                error={
                  Boolean(errors.departmentId) ||
                  Boolean(departmentServerError)
                }
                disabled
              >
                <InputLabel id="schedule-form-department" shrink>
                  {tForm(K.Schedules.Form.department)}
                </InputLabel>
                <Select
                  labelId="schedule-form-department"
                  value={selectedDoctor ? selectedDoctor.departmentId : ""}
                  label={tForm(K.Schedules.Form.department)}
                  displayEmpty
                  renderValue={() =>
                    selectedDoctor?.department.name ?? ""
                  }
                >
                  {selectedDoctor ? (
                    <MenuItem value={selectedDoctor.departmentId}>
                      {selectedDoctor.department.name}
                    </MenuItem>
                  ) : null}
                </Select>
                {errorMessage(errors.departmentId?.message) ? (
                  <Box sx={{ mt: 0.5, ml: 1.5 }}>
                    <Alert severity="error" sx={{ py: 0 }}>
                      {errorMessage(errors.departmentId?.message)}
                    </Alert>
                  </Box>
                ) : null}
                {departmentServerError ? (
                  <Box sx={{ mt: 0.5, ml: 1.5 }}>
                    <Alert severity="error" sx={{ py: 0 }}>
                      {departmentServerError}
                    </Alert>
                  </Box>
                ) : null}
              </FormControl>

              <TextField
                {...register("date")}
                label={tForm(K.Schedules.Form.date)}
                type="date"
                InputLabelProps={{ shrink: true }}
                // `min` greys out past days in the native date-picker. Only
                // applied in create mode — edit mode disables the input
                // outright, and the existing date may pre-date `today`.
                inputProps={isEdit ? undefined : { min: today }}
                fullWidth
                required
                disabled={dateInputDisabled}
                error={Boolean(errors.date)}
                helperText={
                  errorMessage(errors.date?.message) ??
                  (isDateLocked && !isEdit && lockedDateLabel
                    ? tForm(K.Schedules.Form.dateLockedHelper, {
                        date: lockedDateLabel,
                      })
                    : undefined)
                }
              />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  {...register("startTime")}
                  label={tForm(K.Schedules.Form.startTime)}
                  type="time"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ step: 300 }}
                  fullWidth
                  disabled={inputsDisabled}
                  error={Boolean(errors.startTime)}
                  helperText={errorMessage(errors.startTime?.message)}
                />
                <TextField
                  {...register("endTime")}
                  label={tForm(K.Schedules.Form.endTime)}
                  type="time"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ step: 300 }}
                  fullWidth
                  disabled={inputsDisabled}
                  error={Boolean(errors.endTime)}
                  helperText={errorMessage(errors.endTime?.message)}
                />
              </Stack>

              <Controller
                control={control}
                name="hasBreak"
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={field.value}
                        onChange={(event) =>
                          field.onChange(event.target.checked)
                        }
                        disabled={inputsDisabled}
                      />
                    }
                    label={tForm(K.Schedules.Form.hasBreak)}
                  />
                )}
              />

              {watchedHasBreak ? (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    {...register("breakStartTime")}
                    label={tForm(K.Schedules.Form.breakStartTime)}
                    type="time"
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                    fullWidth
                    disabled={inputsDisabled}
                    error={Boolean(errors.breakStartTime)}
                    helperText={errorMessage(errors.breakStartTime?.message)}
                  />
                  <TextField
                    {...register("breakEndTime")}
                    label={tForm(K.Schedules.Form.breakEndTime)}
                    type="time"
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                    fullWidth
                    disabled={inputsDisabled}
                    error={Boolean(errors.breakEndTime)}
                    helperText={errorMessage(errors.breakEndTime?.message)}
                  />
                </Stack>
              ) : null}

              <Controller
                control={control}
                name="acceptsBooking"
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={field.value}
                        onChange={(event) =>
                          field.onChange(event.target.checked)
                        }
                        disabled={inputsDisabled}
                      />
                    }
                    label={tForm(K.Schedules.Form.acceptsBooking)}
                  />
                )}
              />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions
          sx={{
            // Read-only mode hides both Save AND Delete, leaving only Close —
            // right-align the lone Close button instead of leaving an empty
            // gap where the Delete button used to sit. Same when the caller
            // lacks delete permission on the active surface OR is viewing
            // someone else's row under `createsLockedToCaller`.
            justifyContent: showDeleteButton ? "space-between" : "flex-end",
            px: 3,
            py: 2,
          }}
        >
          {showDeleteButton ? (
            <Button
              color="error"
              onClick={() => setConfirmingDelete(true)}
              disabled={isSubmitting}
            >
              {tForm(K.Schedules.Form.delete)}
            </Button>
          ) : null}
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose} disabled={isSubmitting}>
              {tForm(K.Schedules.Form.cancel)}
            </Button>
            {showSaveButton ? (
              <Button
                type="submit"
                form="schedule-form"
                variant="contained"
                disabled={isSubmitting}
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
            disabled={isSubmitting}
          >
            {tForm(K.Schedules.Form.deleteCancel)}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={isSubmitting}
          >
            {tForm(K.Schedules.Form.deleteConfirm)}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
