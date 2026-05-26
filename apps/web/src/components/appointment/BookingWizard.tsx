"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import { FE_PATH, FE_PATH_BUILDER } from "@/auth/routes";
import PatientPicker from "@/components/appointment/PatientPicker";
import SlotPicker from "@/components/appointment/SlotPicker";
import AppointmentTypeSelect from "@/components/shared/select/AppointmentTypeSelect";
import DepartmentSelect from "@/components/shared/select/DepartmentSelect";
import DoctorSelect from "@/components/shared/select/DoctorSelect";
import {
  formatDoctorFullName,
  formatPatientFullName,
} from "@/appointment/labels";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { dayjs } from "@/lib/dayjs";
import { createAppointmentAction } from "@/lib/api/appointment.actions";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";
import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import { todayLocalISODate } from "@/lib/utils/date";
import type {
  AppointmentType,
  AppointmentTypeResponse,
} from "@/types/appointment-type.types";
import type { DepartmentRow } from "@/types/department.types";
import type { DoctorListRow } from "@/types/doctor.types";
import type { PatientResponse } from "@/types/patient.types";
import type { SlotResponse } from "@/types/slot.types";

interface BookingWizardProps {
  appointmentTypes: readonly AppointmentTypeResponse[];
  departments: readonly DepartmentRow[];
  /**
   * Page-1 SSR seed for the doctor picker. The picker streams subsequent
   * pages itself via `<DoctorSelect>`. Optional — when omitted, the
   * picker auto-fetches page 1 on mount.
   */
  doctorSeed?: PaginatedListInitial<DoctorListRow>;
  /**
   * Scope the doctor picker / typeahead to one department — used by NURSE
   * (auto-narrowed to caller's department) so the wizard never lets the
   * user pick a foreign-department doctor. `undefined` opens the picker
   * to every department (DOCTOR self-booking case, where the picker is
   * effectively pinned to caller's own row anyway).
   */
  doctorScopeDepartmentId?: string;
  /**
   * Pre-select + lock the department to the caller's home. NURSE callers
   * always pass this; DOCTOR callers leave it `undefined` so they can
   * pick whichever department their schedule lives in.
   */
  forcedDepartmentId?: string;
  /**
   * Gates the "Register new patient" CTA on step 1. When `false` the
   * row drops the button entirely — DOCTOR callers (who book but can't
   * register patients) should never see an affordance whose destination
   * would 403. Computed in the page from
   * `hasPermission(session, PATIENT_CREATE)`.
   */
  canRegisterPatient: boolean;
}

const BOOKING_STEP = {
  PATIENT: 0,
  SLOT: 1,
  CONFIRM: 2,
} as const;

type BookingStep = (typeof BOOKING_STEP)[keyof typeof BOOKING_STEP];

const PROCEDURE_TYPE: AppointmentType = "PROCEDURE";

/**
 * Three-step booking wizard:
 *   1. Patient — typeahead search; pick an existing patient (or jump out
 *      to `/patients/new` and come back).
 *   2. Slot   — pick department + doctor + appointment type + date, then
 *      pick an open slot from the F07 finder grid.
 *   3. Confirm — show the picked tuple + (for PROCEDURE) capture the
 *      mandatory reason; submit fires `createAppointmentAction`.
 *
 * The wizard owns all of its state locally; the route does not maintain
 * a URL-state copy (the picker is multi-axis, so a deep link to a
 * partially-filled wizard isn't useful). On success the wizard navigates
 * to the new appointment's detail page.
 */
export default function BookingWizard({
  appointmentTypes,
  departments,
  doctorSeed,
  doctorScopeDepartmentId,
  forcedDepartmentId,
  canRegisterPatient,
}: BookingWizardProps) {
  const tPatient = useTranslations(NS.BookingWizardPatient);
  const tSlot = useTranslations(NS.BookingWizardSlot);
  const tConfirm = useTranslations(NS.BookingWizardConfirm);
  const tStepLabels = useTranslations(NS.BookingWizardStepLabels);
  const tErrors = useTranslations(NS.BookingWizardErrors);
  const tType = useTranslations(NS.CommonAppointmentType);
  const locale = useLocale();
  const router = useRouter();
  const notify = useNotify();
  const [isSubmitting, startSubmit] = useTransition();

  const [step, setStep] = useState<BookingStep>(BOOKING_STEP.PATIENT);

  // Step 1 state
  const [patient, setPatient] = useState<PatientResponse | null>(null);

  // Step 2 state
  const [departmentId, setDepartmentId] = useState<string>(
    forcedDepartmentId ?? "",
  );
  const [doctor, setDoctor] = useState<DoctorListRow | null>(null);
  const [appointmentType, setAppointmentType] = useState<
    AppointmentType | ""
  >("");
  const [date, setDate] = useState<string>(todayLocalISODate());
  const [slot, setSlot] = useState<SlotResponse | null>(null);

  // Step 3 state
  const [reason, setReason] = useState<string>("");
  const [serverError, setServerError] = useState<string | null>(null);

  // Cascade the picked `departmentId` into the doctor picker so paged
  // fetches narrow correctly. Falls back to `doctorScopeDepartmentId`
  // (NURSE auto-narrow) when no department is picked. `forcedDepartmentId`
  // pins the picked value to the caller's home, so for NURSE callers
  // the two are the same and the picker never broadens. Passed directly
  // to `<DoctorSelect>` — the picker owns its own loader closure +
  // reset-on-departmentId-change behaviour.
  const doctorListDepartmentId = departmentId || doctorScopeDepartmentId;

  // When the user changes department or type, the previously-picked slot
  // is no longer valid (the slot grid is dimension-locked on the
  // `(doctor, department, date, type)` tuple). Drop it so the user
  // re-picks.
  useEffect(() => {
    setSlot(null);
  }, [departmentId, doctor, appointmentType, date]);

  // When the user changes department, if the picked doctor is no longer
  // in it, clear the selection so the picker reflects reality.
  useEffect(() => {
    if (!doctor) {
      return;
    }

    if (departmentId && doctor.departmentId !== departmentId) {
      setDoctor(null);
    }
  }, [doctor, departmentId]);

  // Not every department offers every appointment type — when the user
  // changes (or clears) the department, drop any previously-picked type
  // so the BE doesn't 400 with `DEPARTMENT_TYPE_NOT_ALLOWED`. The
  // `<AppointmentTypeSelect>` below is also disabled until a department
  // is picked, so this effect mostly kicks in when the user goes back
  // and changes their mind.
  useEffect(() => {
    setAppointmentType("");
  }, [departmentId]);

  const handlePickPatient = useCallback((next: PatientResponse | null) => {
    setPatient(next);
  }, []);

  const handlePickSlot = useCallback((next: SlotResponse | null) => {
    setSlot(next);
  }, []);

  // Picking a doctor BEFORE a department auto-fills the doctor's home
  // department, letting the user start from "who" rather than "where".
  // Safe-by-default: only fills when the department is currently empty
  // — never overrides an explicit dept choice. `forcedDepartmentId`
  // already pins the dept for NURSE, so this branch is only ever
  // reached by DOCTOR callers (and only when they haven't picked a
  // department yet).
  const handlePickDoctor = useCallback(
    (next: DoctorListRow | null) => {
      setDoctor(next);

      if (next && !departmentId && !forcedDepartmentId) {
        setDepartmentId(next.departmentId);
      }
    },
    [departmentId, forcedDepartmentId],
  );

  const handleNextFromPatient = useCallback(() => {
    if (!patient) {
      notify.error(undefined, tErrors(K.BookingWizard.Errors.missingPatient));

      return;
    }

    setStep(BOOKING_STEP.SLOT);
  }, [patient, notify, tErrors]);

  const handleNextFromSlot = useCallback(() => {
    if (!departmentId) {
      notify.error(undefined, tErrors(K.BookingWizard.Errors.missingDepartment));

      return;
    }

    if (!doctor) {
      notify.error(undefined, tErrors(K.BookingWizard.Errors.missingDoctor));

      return;
    }

    if (!appointmentType) {
      notify.error(undefined, tErrors(K.BookingWizard.Errors.missingType));

      return;
    }

    if (!date) {
      notify.error(undefined, tErrors(K.BookingWizard.Errors.missingDate));

      return;
    }

    if (!slot) {
      notify.error(undefined, tErrors(K.BookingWizard.Errors.missingSlot));

      return;
    }

    setStep(BOOKING_STEP.CONFIRM);
  }, [
    departmentId,
    doctor,
    appointmentType,
    date,
    slot,
    notify,
    tErrors,
  ]);

  const handleSubmit = useCallback(() => {
    if (!patient || !slot || !doctor || !appointmentType) {
      return;
    }

    if (appointmentType === PROCEDURE_TYPE && reason.trim().length === 0) {
      notify.error(undefined, tErrors(K.BookingWizard.Errors.missingReason));

      return;
    }

    setServerError(null);

    startSubmit(async () => {
      const result = await createAppointmentAction({
        patientId: patient.id,
        doctorId: doctor.id,
        departmentId: slot.departmentId,
        scheduleId: slot.scheduleId,
        appointmentType,
        startAt: slot.startAt,
        reason: reason.trim().length === 0 ? null : reason.trim(),
      });

      if (!result.ok) {
        notify.error(
          result.error.code,
          tErrors(K.BookingWizard.Errors.generic),
        );
        setServerError(tErrors(K.BookingWizard.Errors.generic));

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.APPOINTMENT_CREATED);
      router.push(FE_PATH_BUILDER.appointmentDetail(result.data.id));
    });
  }, [
    patient,
    slot,
    doctor,
    appointmentType,
    reason,
    notify,
    router,
    tErrors,
  ]);

  const selectedAppointmentType = useMemo(() => {
    return appointmentTypes.find((t) => t.code === appointmentType) ?? null;
  }, [appointmentTypes, appointmentType]);

  return (
    <Stack spacing={3}>
      <Stepper activeStep={step} alternativeLabel>
        <Step>
          <StepLabel>
            {tStepLabels(K.BookingWizard.stepLabels.patient)}
          </StepLabel>
        </Step>
        <Step>
          <StepLabel>
            {tStepLabels(K.BookingWizard.stepLabels.slot)}
          </StepLabel>
        </Step>
        <Step>
          <StepLabel>
            {tStepLabels(K.BookingWizard.stepLabels.confirm)}
          </StepLabel>
        </Step>
      </Stepper>

      {step === BOOKING_STEP.PATIENT ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={3}>
              <PatientPicker
                value={patient}
                onChange={handlePickPatient}
              />
              <Stack
                direction={{ xs: "column-reverse", sm: "row" }}
                spacing={1.5}
                justifyContent={
                  canRegisterPatient ? "space-between" : "flex-end"
                }
              >
                {canRegisterPatient ? (
                  <Button
                    type="button"
                    variant="text"
                    onClick={() => router.push(FE_PATH.PATIENTS_NEW)}
                  >
                    {tPatient(K.BookingWizard.Patient.registerCta)}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="contained"
                  color="primary"
                  disabled={!patient}
                  onClick={handleNextFromPatient}
                >
                  {tPatient(K.BookingWizard.Patient.next)}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {step === BOOKING_STEP.SLOT ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={3}>
              {/*
                Step-2 form grid. 2 columns on `md+`, single column on
                `xs`. Both rows share the same column tracks so each
                field lines up vertically with its sibling above /
                below — the previous Stack-of-Stacks layout left the
                doctor picker's Autocomplete wrapping in a `flexGrow`
                Box, which read wider than the sibling selects next to
                it. `minmax(0, 1fr)` prevents Autocomplete's intrinsic
                min-width from blowing out one of the two tracks.
              */}
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
                <DepartmentSelect
                  value={departmentId}
                  onChange={setDepartmentId}
                  departments={departments}
                  label={tSlot(K.BookingWizard.Slot.departmentLabel)}
                  required
                  disabled={Boolean(forcedDepartmentId)}
                  helperText={
                    forcedDepartmentId
                      ? tSlot(K.BookingWizard.Slot.departmentLockedHelper)
                      : undefined
                  }
                />
                <Box sx={{ minWidth: 0 }}>
                  <DoctorSelect
                    value={doctor}
                    onChange={handlePickDoctor}
                    departmentId={doctorListDepartmentId}
                    initial={doctorSeed}
                    label={tSlot(K.BookingWizard.Slot.doctorLabel)}
                    placeholder={tSlot(
                      K.BookingWizard.Slot.doctorPlaceholder,
                    )}
                    required
                  />
                </Box>
                {/*
                  TODO(F09 follow-up): pre-filter the appointment-type
                  options to those the picked department actually offers.
                  The BE knows the `department_appointment_types` join
                  table but does not currently surface it on the wire
                  (see `DepartmentResponseDto` — no `allowedAppointmentTypes`
                  field, no `GET /departments/:id/appointment-types`
                  route). For now the wizard shows the full catalog and
                  the BE rejects mismatches with
                  `400 DEPARTMENT_TYPE_NOT_ALLOWED`, which `useNotify`
                  surfaces via the existing `ERROR_CODE_TO_KEY` map
                  (`Snackbar.Errors.departmentTypeNotAllowed`). Picking
                  the right wire shape (extra field on
                  `DepartmentResponseDto` vs. a dedicated lookup endpoint)
                  is a backend ticket — kept out of scope here.
                */}
                <AppointmentTypeSelect
                  value={appointmentType}
                  onChange={setAppointmentType}
                  types={appointmentTypes}
                  label={tSlot(K.BookingWizard.Slot.typeLabel)}
                  required
                  disabled={!departmentId}
                />
                <TextField
                  type="date"
                  required
                  fullWidth
                  label={tSlot(K.BookingWizard.Slot.dateLabel)}
                  helperText={tSlot(K.BookingWizard.Slot.dateHelper)}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: todayLocalISODate() }}
                />
              </Box>
              <SlotPicker
                doctorId={doctor?.id ?? null}
                departmentId={departmentId || null}
                date={date}
                type={(appointmentType || null) as AppointmentType | null}
                value={slot}
                onChange={handlePickSlot}
                locale={locale}
              />
              <Stack
                direction={{ xs: "column-reverse", sm: "row" }}
                spacing={1.5}
                justifyContent="space-between"
              >
                <Button
                  type="button"
                  variant="text"
                  onClick={() => setStep(BOOKING_STEP.PATIENT)}
                >
                  {tSlot(K.BookingWizard.Slot.back)}
                </Button>
                <Button
                  type="button"
                  variant="contained"
                  color="primary"
                  disabled={!slot}
                  onClick={handleNextFromSlot}
                >
                  {tSlot(K.BookingWizard.Slot.next)}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {step === BOOKING_STEP.CONFIRM ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={3}>
              {serverError ? (
                <Alert severity="error">{serverError}</Alert>
              ) : null}
              <Typography variant="h6" component="h2">
                {tConfirm(K.BookingWizard.Confirm.title)}
              </Typography>
              <SummaryRow
                label={tConfirm(K.BookingWizard.Confirm.patientLabel)}
                value={
                  patient
                    ? `${formatPatientFullName(patient)} · HN ${patient.hn}`
                    : "—"
                }
              />
              <SummaryRow
                label={tConfirm(K.BookingWizard.Confirm.doctorLabel)}
                value={
                  doctor
                    ? `${formatDoctorFullName(doctor)} (${doctor.doctorCode})`
                    : "—"
                }
              />
              <SummaryRow
                label={tConfirm(K.BookingWizard.Confirm.departmentLabel)}
                value={
                  departments.find((d) => d.id === departmentId)?.name ?? "—"
                }
              />
              <SummaryRow
                label={tConfirm(K.BookingWizard.Confirm.appointmentType)}
                value={
                  selectedAppointmentType
                    ? `${tType(selectedAppointmentType.code)} (${selectedAppointmentType.durationMinutes} min)`
                    : "—"
                }
              />
              <SummaryRow
                label={tConfirm(K.BookingWizard.Confirm.startsAt)}
                value={
                  slot
                    ? dayjs(slot.startAt)
                        .locale(locale)
                        .format("ddd, D MMM YYYY HH:mm")
                    : "—"
                }
              />
              <SummaryRow
                label={tConfirm(K.BookingWizard.Confirm.endsAt)}
                value={
                  slot
                    ? dayjs(slot.endAt)
                        .locale(locale)
                        .format("ddd, D MMM YYYY HH:mm")
                    : "—"
                }
              />
              <TextField
                label={tSlot(K.BookingWizard.Slot.reasonLabel)}
                placeholder={tSlot(K.BookingWizard.Slot.reasonPlaceholder)}
                multiline
                minRows={2}
                required={appointmentType === PROCEDURE_TYPE}
                fullWidth
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                helperText={
                  appointmentType === PROCEDURE_TYPE
                    ? tSlot(K.BookingWizard.Slot.reasonRequiredHelper)
                    : tSlot(K.BookingWizard.Slot.reasonHelper)
                }
              />
              <Stack
                direction={{ xs: "column-reverse", sm: "row" }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems="center"
              >
                <Button
                  type="button"
                  variant="text"
                  onClick={() => setStep(BOOKING_STEP.SLOT)}
                  disabled={isSubmitting}
                >
                  {tConfirm(K.BookingWizard.Confirm.back)}
                </Button>
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                >
                  {isSubmitting ? <CircularProgress size={20} /> : null}
                  <Button
                    type="button"
                    variant="contained"
                    color="primary"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                  >
                    {tConfirm(K.BookingWizard.Confirm.submit)}
                  </Button>
                </Stack>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.5, sm: 2 }}
      alignItems={{ xs: "flex-start", sm: "baseline" }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: 120 }}
      >
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}
