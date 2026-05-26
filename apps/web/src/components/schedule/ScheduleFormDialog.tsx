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
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import DepartmentSelect from "@/components/shared/select/DepartmentSelect";
import DoctorSelect from "@/components/shared/select/DoctorSelect";
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
import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import type { DepartmentRow } from "@/types/department.types";
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
   * Page-1 SSR seed for the doctor picker. Streamed pages thereafter via
   * `<DoctorSelect>` (which wraps `usePaginatedList`) as the user scrolls
   * the dropdown.
   */
  doctorSeed: PaginatedListInitial<DoctorListRow>;
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
  /**
   * Full department catalog — used to look up the prefilled department
   * row's name when the dialog opens in create mode without a picked
   * doctor (NURSE callers, who don't carry their own `lockedDoctorId`).
   * The picker still auto-fills from `selectedDoctor.department` once a
   * doctor is chosen.
   */
  departments: readonly DepartmentRow[];
  /**
   * Caller's home department id — pre-fills the (always-disabled)
   * department field in CREATE mode so a NURSE who opens the modal
   * already sees their dept selected. The form value is also pre-set
   * to this id so submit carries the right department even before the
   * caller picks a doctor.
   *
   * When omitted, the dialog falls back to the existing behavior:
   * department mirrors the picked doctor's department.
   */
  prefilledDepartmentId?: string;
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
  doctorSeed,
  doctorDepartmentId,
  lockedDoctorId,
  createsLockedToCaller,
  callerDoctorId,
  canDelete,
  departments,
  prefilledDepartmentId,
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

  // Track the selected doctor row directly (rather than looking it up
  // from a streamed list each render). The picker hands the row back on
  // `onChange`, so this is the cheapest source of truth for the
  // department auto-fill below — no need to re-resolve from the picker's
  // internal `loaded` array.
  const [pickedDoctor, setPickedDoctor] = useState<DoctorListRow | null>(
    () => doctorSeed.data.find((d) => d.id === (editing?.doctorId ?? "")) ?? null,
  );

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
  const watchedDepartmentId = watch("departmentId");
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
      // Clear `pickedDoctor` — the picker is disabled in edit mode, so
      // the `selectedDoctor` fallback (synth from `editing.doctor`)
      // takes over and powers both the disabled picker label and the
      // department field below.
      setPickedDoctor(null);

      return;
    }

    // Create mode — start from the prefill (the cell the user clicked).
    // Department resolution order: cell prefill (explicit) → caller's
    // home department (NURSE / DOCTOR pre-fill) → empty. Doctor pre-
    // fill (`lockedDoctorId`, DOCTOR caller pinned to their own row)
    // narrows further; the department effect below re-syncs once the
    // doctor is resolved.
    reset({
      doctorId: lockedDoctorId ?? "",
      departmentId:
        prefill?.departmentId ?? prefilledDepartmentId ?? "",
      date: prefill?.date ?? todayLocalISODate(),
      startTime: prefill?.startTime ?? DEFAULT_START_TIME,
      endTime: prefill?.endTime ?? DEFAULT_END_TIME,
      hasBreak: false,
      breakStartTime: DEFAULT_BREAK_START_TIME,
      breakEndTime: DEFAULT_BREAK_END_TIME,
      acceptsBooking: true,
    });
    // Resolve the picker selection from `lockedDoctorId` (DOCTOR caller
    // locked to their own row) against the SSR seed. When the seed
    // doesn't contain the locked id (rare — caller's own row almost
    // always sits on page 1), fall back to `null`; the picker is
    // disabled in this case anyway, so the form's `doctorId` field
    // still carries the right value for submit.
    if (lockedDoctorId) {
      setPickedDoctor(
        doctorSeed.data.find((d) => d.id === lockedDoctorId) ?? null,
      );
    } else {
      setPickedDoctor(null);
    }
  }, [
    open,
    editing,
    lockedDoctorId,
    prefill,
    prefilledDepartmentId,
    reset,
    doctorSeed,
  ]);

  // The selected doctor's department powers the department field. After
  // the RBAC refactor a doctor belongs to exactly one department, so the
  // picker collapses to a single, fixed entry — when the doctor changes,
  // the department auto-pins to that doctor's department.
  //
  // Source of truth is `pickedDoctor` (the row the picker handed back on
  // `onChange`), reconciled against `watchedDoctorId` so a stale picker
  // selection can't desync from the form's `doctorId` field after a
  // `reset()` from `useForm`.
  //
  // Fallback path: when EDITING a schedule whose doctor isn't in the
  // streamed picker list (the SSR fetch is paginated, so doctors past
  // page 1 aren't streamed in until the picker scrolls), synthesize a
  // thin `DoctorListRow` from the schedule's embedded `doctor` +
  // `department` refs. The picker is `disabled={isEdit}` so the
  // synthetic row never has to power search / dropdown rendering — it
  // only needs to supply the label + department for the disabled fields
  // above. Without this the form would render a blank doctor name and
  // blank department for any schedule whose doctor sits beyond
  // `DOCTOR_INFINITE_SCROLL_PAGE_SIZE`.
  const selectedDoctor = useMemo<DoctorListRow | null>(() => {
    if (pickedDoctor && pickedDoctor.id === watchedDoctorId) {
      return pickedDoctor;
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
  }, [pickedDoctor, watchedDoctorId, editing, locale]);

  useEffect(() => {
    if (!selectedDoctor) {
      return;
    }

    setValue("departmentId", selectedDoctor.departmentId, {
      shouldValidate: false,
      shouldDirty: false,
    });
  }, [selectedDoctor, setValue]);

  // Display-side wiring for the (always-disabled) department picker.
  // The form's `departmentId` is the authoritative value (it's what
  // submit sends to the BE); the picker just needs a label to render.
  //
  //   - When a doctor is picked, the form value === doctor's dept; the
  //     `selectedDoctor.department` carries the name inline.
  //   - When no doctor is picked but a prefill landed (NURSE caller
  //     entering create mode), the form value === `prefilledDepartmentId`;
  //     look up the matching row in the caller-supplied `departments`
  //     catalog so the picker shows the right name.
  //   - When the form value happens to be an id that isn't in the
  //     catalog (defensive — shouldn't happen because the page passes
  //     the full list), synthesize a thin row with an empty name so the
  //     picker still has something to render and no crash.
  const departmentDisplayValue = watchedDepartmentId ?? "";
  const departmentDisplayOptions = useMemo<readonly DepartmentRow[]>(() => {
    if (selectedDoctor) {
      return [
        {
          id: selectedDoctor.departmentId,
          name: selectedDoctor.department.name,
          description: null,
        },
      ];
    }

    if (!departmentDisplayValue) {
      return [];
    }

    const fromCatalog = departments.find(
      (d) => d.id === departmentDisplayValue,
    );

    if (fromCatalog) {
      return [fromCatalog];
    }

    return [
      { id: departmentDisplayValue, name: "", description: null },
    ];
  }, [selectedDoctor, departmentDisplayValue, departments]);

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
                  <DoctorSelect
                    value={selectedDoctor}
                    onChange={(next) => {
                      setPickedDoctor(next);
                      field.onChange(next?.id ?? "");
                    }}
                    departmentId={doctorDepartmentId}
                    initial={doctorSeed}
                    label={tForm(K.Schedules.Form.doctor)}
                    placeholder={tForm(K.Schedules.Form.doctorPlaceholder)}
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

              {/* Department field — always `disabled`. Renders the
                  form's current `departmentId` value, which is driven by
                  one of three sources (in this priority order):
                    1. The selected doctor's department (auto-synced via
                       the effect above whenever `selectedDoctor` changes).
                    2. `prefilledDepartmentId` (the caller's home
                       department, set in the create-mode `reset()`
                       call) — applies until a doctor is picked.
                    3. The user-provided cell prefill (only set by the
                       day-details create flow).
                  The `departments` prop carries the single row matching
                  whichever id is currently in the form so the picker
                  has a label to render. Falls back to a single synthesized
                  row when the id isn't in the catalog (defensive — shouldn't
                  happen because the page always passes the full list). */}
              <Box>
                <DepartmentSelect
                  value={departmentDisplayValue}
                  onChange={() => {
                    // disabled — onChange is unreachable, but the prop is
                    // required by the wrapper signature
                  }}
                  departments={departmentDisplayOptions}
                  label={tForm(K.Schedules.Form.department)}
                  disabled
                  error={
                    Boolean(errors.departmentId) ||
                    Boolean(departmentServerError)
                  }
                />
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
              </Box>

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
