"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
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
  useRef,
  useState,
  useTransition,
} from "react";

import { FE_PATH, FE_PATH_BUILDER } from "@/auth/routes";
import ContinuationPicker from "@/components/appointment/ContinuationPicker";
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
import {
  isContinuationAppointmentType,
  STANDALONE_APPOINTMENT_TYPE,
} from "@/lib/api/appointment.const";
import { getDepartmentAppointmentTypesAction } from "@/lib/api/department.actions";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";
import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import { todayLocalISODate } from "@/lib/utils/date";
import type { AppointmentResponse } from "@/types/appointment.types";
import type { AppointmentType } from "@/types/appointment-type.types";
import type {
  DepartmentAppointmentTypeRow,
  DepartmentRow,
} from "@/types/department.types";
import type { DoctorListRow } from "@/types/doctor.types";
import type { PatientResponse } from "@/types/patient.types";
import type { SlotResponse } from "@/types/slot.types";

interface BookingWizardProps {
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
   * Pre-fill + lock the doctor picker to the caller's own row. Used when
   * the caller's effective `appointment.create` scope is `.own` only
   * (DOCTOR self-booking) — the BE forces the doctor to the caller anyway,
   * so making the user pick a value they don't actually control is pure
   * friction. The picker stays disabled (greyed out, no dropdown) and the
   * row threads straight into the `POST /appointments` payload.
   */
  lockedDoctor?: DoctorListRow;
  /**
   * Gates the "Register new patient" CTA on step 1. When `false` the
   * row drops the button entirely — DOCTOR callers (who book but can't
   * register patients) should never see an affordance whose destination
   * would 403. Computed in the page from
   * `hasPermission(session, PATIENT_CREATE)`.
   */
  canRegisterPatient: boolean;
  /**
   * F14 — when the wizard is opened from the referrals pickup queue
   * (`/referrals/...` → `/appointments/new?previousAppointmentId=…`),
   * the page resolves the referenced appointment server-side and threads
   * it in here. The wizard then:
   *   1. Pre-fills the patient picker (step 1 stays editable but seeded).
   *   2. Skips the continuation step entirely — `previousAppointmentId`
   *      is set from this row, and the BE will infer + extend the case.
   *   3. Shows a notice on step 1 explaining the pre-fill.
   */
  referralSourceAppointment?: AppointmentResponse;
  /**
   * F15 — when the wizard is opened from the slot finder
   * (`/find-slot` → `/appointments/new?doctorScheduleId=…&startAt=…
   * &appointmentType=…&departmentId=…`), the page resolves the picked
   * doctor + duration server-side and threads them in here. The wizard
   * then:
   *   1. Pre-fills `departmentId`, `doctor`, `appointmentType`, `date`,
   *      and `slot` from the deep-link tuple.
   *   2. Locks (disables) every step-2 input — the slot picker is the
   *      output of the slot finder, not something the user re-picks.
   *   3. Lands the user on the patient picker (the only remaining
   *      user-actionable step). After patient + continuation, the user
   *      reaches the locked slot step and clicks Confirm.
   */
  prefilledSlot?: PrefilledSlot;
}

/**
 * F15 deep-link payload — the slot finder's "Book this slot" CTA threads
 * this through the page server-component into the wizard. Every field is
 * resolved server-side so the wizard never blocks on a fetch to render
 * the locked state.
 */
export interface PrefilledSlot {
  doctorScheduleId: string;
  /** ISO 8601 UTC datetime — the picked slot's `startAt`. */
  startAt: string;
  /** ISO 8601 UTC datetime — `startAt + durationMinutes`, computed on the
   * page. The BE never echoed `endAt` on the deep-link query string; we
   * compute it from the per-(department, type) duration so the wizard's
   * confirm step has a stable summary without a follow-up slot-finder
   * round-trip. */
  endAt: string;
  appointmentType: AppointmentType;
  departmentId: string;
  /** Full doctor row (resolved on the page via `getDoctor()`) so the
   * picker can render the locked selection without a follow-up fetch. */
  doctor: DoctorListRow;
}

/**
 * The wizard has four steps post-F14:
 *   0. PATIENT     — pick or seed the patient.
 *   1. CONTINUATION — "Is this a continuation of a prior visit?" — Yes
 *                     surfaces the prior-visits picker. Skipped entirely
 *                     when the wizard was deep-linked from the referrals
 *                     queue (the referral IS the prior visit).
 *   2. SLOT        — department + doctor + type + date + slot.
 *   3. CONFIRM     — review + submit.
 */
const BOOKING_STEP = {
  PATIENT: 0,
  CONTINUATION: 1,
  SLOT: 2,
  CONFIRM: 3,
} as const;

type BookingStep = (typeof BOOKING_STEP)[keyof typeof BOOKING_STEP];

const PROCEDURE_TYPE: AppointmentType = "PROCEDURE";

/**
 * Two-state answer to "Is this a continuation?" on step 2. Persisted in
 * the wizard's state so a back-step + forward re-step doesn't reset the
 * user's pick.
 */
const CONTINUATION_CHOICE = {
  NO: "no",
  YES: "yes",
} as const;

type ContinuationChoice =
  (typeof CONTINUATION_CHOICE)[keyof typeof CONTINUATION_CHOICE];

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
  departments,
  doctorSeed,
  doctorScopeDepartmentId,
  forcedDepartmentId,
  lockedDoctor,
  canRegisterPatient,
  referralSourceAppointment,
  prefilledSlot,
}: BookingWizardProps) {
  const tPatient = useTranslations(NS.BookingWizardPatient);
  const tContinuation = useTranslations(NS.BookingWizardContinuation);
  const tSlot = useTranslations(NS.BookingWizardSlot);
  const tConfirm = useTranslations(NS.BookingWizardConfirm);
  const tStepLabels = useTranslations(NS.BookingWizardStepLabels);
  const tErrors = useTranslations(NS.BookingWizardErrors);
  const tType = useTranslations(NS.CommonAppointmentType);
  const locale = useLocale();
  const router = useRouter();
  const notify = useNotify();
  const [isSubmitting, startSubmit] = useTransition();

  // When the wizard is deep-linked from the referrals queue, the
  // continuation step is short-circuited: `previousAppointmentId` is
  // already known, the patient is already known, and asking the user to
  // pick a prior visit again would be redundant friction.
  const skipsContinuationStep = Boolean(referralSourceAppointment);

  const [step, setStep] = useState<BookingStep>(BOOKING_STEP.PATIENT);

  // Step 1 state — pre-filled from the referral source when present so
  // the front desk lands on step 2 with the patient already selected.
  const [patient, setPatient] = useState<PatientResponse | null>(() => {
    if (!referralSourceAppointment) {
      return null;
    }

    // We don't have a full `PatientResponse` in the referral payload —
    // only the `AppointmentPatientRef` (id + hn + names). The picker's
    // `value` prop accepts the same nominal shape because it's only used
    // to render the chip + thread the id through; the BE doesn't need
    // the wider patient fields at submit time. Cast through `unknown` to
    // bridge the structural gap while keeping the wizard surface typed.
    const ref = referralSourceAppointment.patient;

    return {
      id: ref.id,
      hn: ref.hn,
      firstNameEn: ref.firstNameEn,
      lastNameEn: ref.lastNameEn,
      firstNameTh: ref.firstNameTh,
      lastNameTh: ref.lastNameTh,
    } as unknown as PatientResponse;
  });

  // F14 continuation step state. `previousVisit` is the picked prior
  // appointment (null when "No" is selected or before the user picks).
  // When the wizard is deep-linked from the referrals queue, the source
  // appointment IS the prior visit — pre-fill it here so the create
  // payload carries `previousAppointmentId` even though the user never
  // sees the continuation step.
  const [continuationChoice, setContinuationChoice] =
    useState<ContinuationChoice>(
      referralSourceAppointment ? CONTINUATION_CHOICE.YES : CONTINUATION_CHOICE.NO,
    );
  const [previousVisit, setPreviousVisit] = useState<AppointmentResponse | null>(
    referralSourceAppointment ?? null,
  );

  // Step 2 state. F15 — the slot-finder deep-link pre-fills every step-2
  // dimension (department / doctor / type / date / slot) from the picked
  // tuple; otherwise we fall back to the forced / locked props (referrals
  // / DOCTOR self-booking) and finally to a blank state.
  const [departmentId, setDepartmentId] = useState<string>(
    prefilledSlot?.departmentId ?? forcedDepartmentId ?? "",
  );
  const [doctor, setDoctor] = useState<DoctorListRow | null>(
    prefilledSlot?.doctor ?? lockedDoctor ?? null,
  );
  const [appointmentType, setAppointmentType] = useState<
    AppointmentType | ""
  >(prefilledSlot?.appointmentType ?? "");
  const [date, setDate] = useState<string>(
    prefilledSlot
      ? dayjs(prefilledSlot.startAt).format("YYYY-MM-DD")
      : todayLocalISODate(),
  );
  const [slot, setSlot] = useState<SlotResponse | null>(
    prefilledSlot
      ? {
          startAt: prefilledSlot.startAt,
          endAt: prefilledSlot.endAt,
          departmentId: prefilledSlot.departmentId,
          scheduleId: prefilledSlot.doctorScheduleId,
          doctorId: prefilledSlot.doctor.id,
          doctorCode: prefilledSlot.doctor.doctorCode,
          doctorName: prefilledSlot.doctor.fullName,
        }
      : null,
  );

  // F15 — when the wizard is opened with a fully-resolved slot tuple,
  // every step-2 input is locked (the slot finder IS the picker; the
  // user shouldn't re-pick anything here). Computed once on mount —
  // `prefilledSlot` never changes after the page server-component
  // threads it through.
  const hasPrefilledSlot = prefilledSlot !== undefined;

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
  //
  // F15 — `hasPrefilledSlot` skips the first-render run that would
  // otherwise stamp `null` over the prefilled slot. The deep-link's tuple
  // is by construction valid (the user just clicked it in the slot
  // finder), so we don't need the cascade to fire on mount. The effect
  // still runs on dependency CHANGES, but in the prefilled flow every
  // dimension is locked so no change can happen — the only way back to
  // an empty slot in that flow is the page reload.
  const slotResetSkipRef = useRef<boolean>(hasPrefilledSlot);

  useEffect(() => {
    if (slotResetSkipRef.current) {
      slotResetSkipRef.current = false;

      return;
    }

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

  // F13 per-(department, type) booking-rule catalog. Once the user
  // picks a department, we fetch `GET /departments/:id/appointment-types`
  // through the server action — each row carries the department-scoped
  // `durationMinutes` plus the optional `bookingWindowStartMinute` /
  // `bookingWindowEndMinute` bounds that drive both the type Select's
  // window chip copy ("Before 11:00 only" / "From 13:00" / "09:00 –
  // 11:00") AND the confirm-step duration summary. Before any
  // department is picked the type Select is disabled, so an empty list
  // is the correct skeleton state.
  const [departmentTypes, setDepartmentTypes] = useState<
    readonly DepartmentAppointmentTypeRow[]
  >([]);

  useEffect(() => {
    if (!departmentId) {
      setDepartmentTypes([]);

      return;
    }

    let cancelled = false;

    (async () => {
      const rows = await getDepartmentAppointmentTypesAction(departmentId);

      if (!cancelled) {
        setDepartmentTypes(rows);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  // When the user changes (or clears) the department, drop any
  // previously-picked type if it's no longer in the new department's
  // allowed set. Without this guard a `(deptA → PROCEDURE → deptB)`
  // sequence would leave PROCEDURE selected even when deptB doesn't
  // offer it; submitting that pair would 400 with
  // `DEPARTMENT_TYPE_NOT_ALLOWED`. Clearing the picked type when the
  // dept changes is the matching write-side cascade for the
  // per-department type-catalog narrowing above. Also clears on
  // dept=undefined (user cleared the department) so the state stays
  // consistent.
  useEffect(() => {
    if (!appointmentType) {
      return;
    }

    if (!departmentId) {
      setAppointmentType("");

      return;
    }

    const dept = departments.find((d) => d.id === departmentId);

    if (!dept) {
      setAppointmentType("");

      return;
    }

    if (!dept.allowedAppointmentTypes.includes(appointmentType)) {
      setAppointmentType("");
    }
  }, [departmentId, appointmentType, departments]);

  // F14 / F16 / F17 — narrow the type catalog based on booking mode.
  //
  // Three cases:
  //   1. `hasPrefilledSlot` (slot-finder deep-link) — return the full
  //      per-department catalog untouched. The type is already locked to
  //      whatever the slot finder chose; clearing or restricting it
  //      would leave the wizard stuck (type = "" AND disabled select →
  //      can never proceed). The BE validates the
  //      (type, previousAppointmentId) pair on submit.
  //
  //   2. Continuation booking (`previousVisit != null`) — filter OUT
  //      `NEW_PATIENT_VISIT`. Everything else (`FOLLOW_UP`, `PROCEDURE`,
  //      `CONSULTATION`) is a valid continuation. The BE enforces the
  //      same rule via `CONTINUATION_APPOINTMENT_TYPE_INVALID`.
  //
  //   3. Standalone booking (no prior visit) — filter DOWN to only
  //      `NEW_PATIENT_VISIT`. The BE rejects any other type with
  //      `STANDALONE_APPOINTMENT_TYPE_INVALID` (F16).
  //
  // We DON'T filter `DepartmentSelect.allowedAppointmentTypes` directly
  // — `departmentTypes` is the per-department-scoped catalog from
  // `GET /departments/:id/appointment-types` and is the authoritative
  // input to `<AppointmentTypeSelect>`.
  const isContinuationBooking = previousVisit != null;
  const visibleDepartmentTypes = useMemo(() => {
    if (hasPrefilledSlot) {
      return departmentTypes;
    }

    if (isContinuationBooking) {
      return departmentTypes.filter((type) =>
        isContinuationAppointmentType(type.code),
      );
    }

    return departmentTypes.filter(
      (type) => type.code === STANDALONE_APPOINTMENT_TYPE,
    );
  }, [departmentTypes, isContinuationBooking, hasPrefilledSlot]);

  // Write-side cascade matching the read-side narrowing above. If the
  // current `appointmentType` is no longer in the visible set (because
  // the booking mode changed), drop it so the user re-picks from the
  // narrowed catalog instead of submitting an invalid pair.
  //
  // Continuation → standalone: `NEW_PATIENT_VISIT` must now be selected;
  //   any continuation type is cleared.
  // Standalone → continuation: `NEW_PATIENT_VISIT` is no longer valid;
  //   it is cleared so the user re-picks a continuation type.
  //
  // F15 exception — skip when `hasPrefilledSlot`: the pre-filled type
  // must never be cleared by this cascade (see the comment on
  // `visibleDepartmentTypes` above for the full rationale).
  useEffect(() => {
    if (hasPrefilledSlot || !appointmentType) {
      return;
    }

    const isInVisibleSet = visibleDepartmentTypes.some(
      (type) => type.code === appointmentType,
    );

    if (!isInVisibleSet) {
      setAppointmentType("");
    }
  }, [hasPrefilledSlot, visibleDepartmentTypes, appointmentType]);

  // True when the wizard is on a continuation flow AND the picked
  // department offers neither `FOLLOW_UP` nor `PROCEDURE`. The
  // type-select catalog will be empty and the user can't move forward —
  // surface the dead-end with a clear instruction instead of leaving
  // the dropdown silently unselectable.
  const showContinuationTypeUnavailable =
    isContinuationBooking &&
    departmentId !== "" &&
    departmentTypes.length > 0 &&
    visibleDepartmentTypes.length === 0;

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

    // Referrals-deep-link bypasses the continuation step (the prior
    // visit is already set). Every other entry forces the user through
    // the explicit "Yes / No" question — even when they pick "No" — so
    // the wizard's case-grouping behaviour is never silent.
    setStep(
      skipsContinuationStep ? BOOKING_STEP.SLOT : BOOKING_STEP.CONTINUATION,
    );
  }, [patient, notify, tErrors, skipsContinuationStep]);

  const handleNextFromContinuation = useCallback(() => {
    if (
      continuationChoice === CONTINUATION_CHOICE.YES &&
      !previousVisit
    ) {
      notify.error(
        undefined,
        tErrors(K.BookingWizard.Errors.missingContinuation),
      );

      return;
    }

    setStep(BOOKING_STEP.SLOT);
  }, [continuationChoice, previousVisit, notify, tErrors]);

  const handleContinuationChoiceChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value as ContinuationChoice;

      setContinuationChoice(next);

      if (next === CONTINUATION_CHOICE.NO) {
        setPreviousVisit(null);
      }
    },
    [],
  );

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
        // F14 continuation linkage. Three cases land here:
        //   - Referrals deep-link → `previousVisit` is the source
        //     appointment, set on mount.
        //   - "Yes, continues" + user picked a row → `previousVisit`
        //     is set.
        //   - "No, this is a new visit" → `previousVisit` is `null` and
        //     we omit the field.
        previousAppointmentId: previousVisit?.id ?? null,
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
    previousVisit,
    notify,
    router,
    tErrors,
  ]);

  const selectedAppointmentType = useMemo(() => {
    return departmentTypes.find((t) => t.code === appointmentType) ?? null;
  }, [departmentTypes, appointmentType]);

  return (
    <Stack spacing={3}>
      <Stepper
        // When the continuation step is hidden, the numeric step values
        // still reflect the underlying state machine — collapse the
        // "Slot" / "Confirm" steps' display index by one so the Stepper
        // ticks the right circle.
        activeStep={skipsContinuationStep && step > BOOKING_STEP.CONTINUATION ? step - 1 : step}
        alternativeLabel
      >
        <Step>
          <StepLabel>
            {tStepLabels(K.BookingWizard.stepLabels.patient)}
          </StepLabel>
        </Step>
        {/*
          F14 — the continuation step is hidden in the Stepper when the
          wizard was deep-linked from the referrals queue, because the
          step is also skipped in the flow. Keeping the indicator in
          sync with the actual step set keeps the activeStep coloring
          honest (otherwise "Slot" would render as step 2 when it's
          really step 1 of the visible flow).
        */}
        {skipsContinuationStep ? null : (
          <Step>
            <StepLabel>
              {tStepLabels(K.BookingWizard.stepLabels.continuation)}
            </StepLabel>
          </Step>
        )}
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
              {skipsContinuationStep ? (
                <Alert severity="info">
                  {tContinuation(
                    K.BookingWizard.Continuation.prefilledNotice,
                  )}
                </Alert>
              ) : null}
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

      {step === BOOKING_STEP.CONTINUATION && patient ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={3}>
              <Stack spacing={0.5}>
                <Typography variant="h6" component="h2">
                  {tContinuation(K.BookingWizard.Continuation.title)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {tContinuation(K.BookingWizard.Continuation.subtitle)}
                </Typography>
              </Stack>
              <RadioGroup
                value={continuationChoice}
                onChange={handleContinuationChoiceChange}
              >
                <FormControlLabel
                  value={CONTINUATION_CHOICE.NO}
                  control={<Radio />}
                  label={tContinuation(
                    K.BookingWizard.Continuation.optionNo,
                  )}
                />
                <FormControlLabel
                  value={CONTINUATION_CHOICE.YES}
                  control={<Radio />}
                  label={tContinuation(
                    K.BookingWizard.Continuation.optionYes,
                  )}
                />
              </RadioGroup>

              {continuationChoice === CONTINUATION_CHOICE.YES ? (
                <ContinuationPicker
                  patientId={patient.id}
                  value={previousVisit}
                  onChange={setPreviousVisit}
                />
              ) : null}

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
                  {tContinuation(K.BookingWizard.Continuation.back)}
                </Button>
                <Button
                  type="button"
                  variant="contained"
                  color="primary"
                  onClick={handleNextFromContinuation}
                  disabled={
                    continuationChoice === CONTINUATION_CHOICE.YES &&
                    !previousVisit
                  }
                >
                  {tContinuation(K.BookingWizard.Continuation.next)}
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
              {showContinuationTypeUnavailable ? (
                <Alert severity="warning">
                  {tSlot(K.BookingWizard.Slot.continuationTypeUnavailable)}
                </Alert>
              ) : null}
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
                  disabled={Boolean(forcedDepartmentId) || hasPrefilledSlot}
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
                    disabled={Boolean(lockedDoctor) || hasPrefilledSlot}
                    helperText={
                      lockedDoctor
                        ? tSlot(K.BookingWizard.Slot.doctorLockedHelper)
                        : undefined
                    }
                  />
                </Box>
                {/* Appointment-type Select narrows to the picked
                    department's `allowedAppointmentTypes` (BE field on
                    `DepartmentResponseDto`). Disabled until a department
                    is picked so the user can't choose before a
                    department; cleared automatically when the picked
                    type isn't offered by the newly-picked department
                    (see the cascade effect above).

                    F14 — when this is a continuation booking
                    (`previousVisit != null`), the catalog is further
                    narrowed to `FOLLOW_UP` / `PROCEDURE` via
                    `visibleDepartmentTypes`. The BE rejects the other
                    two types with `CONTINUATION_APPOINTMENT_TYPE_INVALID`. */}
                <AppointmentTypeSelect
                  value={appointmentType}
                  onChange={setAppointmentType}
                  types={visibleDepartmentTypes}
                  label={tSlot(K.BookingWizard.Slot.typeLabel)}
                  required
                  disabled={
                    !departmentId ||
                    showContinuationTypeUnavailable ||
                    hasPrefilledSlot
                  }
                  error={showContinuationTypeUnavailable}
                  helperText={
                    showContinuationTypeUnavailable
                      ? tSlot(
                          K.BookingWizard.Slot.continuationTypeUnavailable,
                        )
                      : undefined
                  }
                />
                <TextField
                  type="date"
                  required
                  fullWidth
                  label={tSlot(K.BookingWizard.Slot.dateLabel)}
                  helperText={tSlot(K.BookingWizard.Slot.dateHelper)}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={hasPrefilledSlot}
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: { min: todayLocalISODate() },
                  }}
                />
              </Box>
              {hasPrefilledSlot && slot ? (
                <Box
                  sx={{
                    border: 1,
                    borderColor: "primary.light",
                    borderRadius: 1,
                    bgcolor: "primary.50",
                    p: 2,
                  }}
                >
                  <Stack spacing={0.5}>
                    <Typography variant="caption" color="text.secondary">
                      {tSlot(K.BookingWizard.Slot.selectedSlot)}
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {dayjs(slot.startAt)
                        .locale(locale)
                        .format("ddd, D MMM YYYY HH:mm")}
                      {" – "}
                      {dayjs(slot.endAt).locale(locale).format("HH:mm")}
                    </Typography>
                  </Stack>
                </Box>
              ) : (
                <SlotPicker
                  doctorId={doctor?.id ?? null}
                  departmentId={departmentId || null}
                  date={date}
                  type={(appointmentType || null) as AppointmentType | null}
                  value={slot}
                  onChange={handlePickSlot}
                  locale={locale}
                />
              )}
              <Stack
                direction={{ xs: "column-reverse", sm: "row" }}
                spacing={1.5}
                justifyContent="space-between"
              >
                <Button
                  type="button"
                  variant="text"
                  onClick={() =>
                    setStep(
                      skipsContinuationStep
                        ? BOOKING_STEP.PATIENT
                        : BOOKING_STEP.CONTINUATION,
                    )
                  }
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
