"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
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

import AppointmentTypeSelect from "@/components/shared/select/AppointmentTypeSelect";
import DoctorSelect from "@/components/shared/select/DoctorSelect";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { FE_PATH_BUILDER } from "@/auth/routes";
import { createAppointmentAction } from "@/lib/api/appointment.actions";
import { isContinuationAppointmentType } from "@/lib/api/appointment.const";
import { getDepartmentAppointmentTypesAction } from "@/lib/api/department.actions";
import { loadSlotsAction } from "@/lib/api/slot.actions";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";
import { dayjs } from "@/lib/dayjs";
import { todayLocalISODate } from "@/lib/utils/date";
import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import type {
  AppointmentResponse,
} from "@/types/appointment.types";
import type { AppointmentType } from "@/types/appointment-type.types";
import type { DepartmentAppointmentTypeRow } from "@/types/department.types";
import type { DoctorListRow } from "@/types/doctor.types";
import type { SlotResponse } from "@/types/slot.types";

import { formatPatientFullName } from "@/appointment/labels";

interface ReferralBookDialogProps {
  open: boolean;
  onClose: () => void;
  /** The referred appointment — drives `previousAppointmentId` and target dept. */
  referral: AppointmentResponse;
  /** Caller's doctor row when `appointment.create.own` only (locks the picker). */
  lockedDoctor?: DoctorListRow;
  /** Picker SSR seed (scoped to the caller's department). */
  doctorSeed?: PaginatedListInitial<DoctorListRow>;
  /** Doctor picker filter — caller's department for `.own-department` callers. */
  doctorScopeDepartmentId?: string;
}

/**
 * Inline "Book referral" dialog on the F14 referrals queue row. Replaces
 * the previous deep-link to `/appointments/new?previousAppointmentId=…`
 * so the receiving department can finish a referral booking without
 * leaving the queue. Mirrors the standalone wizard's slot step:
 *   1. Doctor select (locked when caller is DOCTOR-with-`.own`-only).
 *   2. Appointment type select (narrowed to continuation types —
 *      `NEW_PATIENT_VISIT` excluded by definition).
 *   3. Date picker.
 *   4. Slot picker — refreshes on any of `(doctor, type, date)` change.
 *
 * Submit pre-fills `previousAppointmentId` from `referral.id` and posts
 * to the same `POST /appointments` the wizard uses. The BE picks up the
 * group + fulfils the referral on the source row.
 */
export default function ReferralBookDialog({
  open,
  onClose,
  referral,
  lockedDoctor,
  doctorSeed,
  doctorScopeDepartmentId,
}: ReferralBookDialogProps) {
  const t = useTranslations(NS.ReferralsBookDialog);
  const locale = useLocale();
  const notify = useNotify();
  const router = useRouter();
  const [isSubmitting, startSubmit] = useTransition();
  const [isLoadingSlots, startSlotsTransition] = useTransition();

  const departmentId = referral.referredToDepartmentId ?? referral.departmentId;

  const [doctor, setDoctor] = useState<DoctorListRow | null>(
    lockedDoctor ?? null,
  );
  const [appointmentType, setAppointmentType] = useState<AppointmentType | "">(
    "",
  );
  const [date, setDate] = useState<string>(todayLocalISODate());
  const [slot, setSlot] = useState<SlotResponse | null>(null);
  const [slots, setSlots] = useState<readonly SlotResponse[]>([]);
  const [departmentTypes, setDepartmentTypes] = useState<
    readonly DepartmentAppointmentTypeRow[]
  >([]);

  const slotRequestSeq = useRef<number>(0);
  const notifyRef = useRef(notify);

  useEffect(() => {
    notifyRef.current = notify;
  });

  useEffect(() => {
    if (!open) {
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
  }, [open, departmentId]);

  const visibleDepartmentTypes = useMemo(() => {
    return departmentTypes.filter((type) =>
      isContinuationAppointmentType(type.code),
    );
  }, [departmentTypes]);

  useEffect(() => {
    if (!appointmentType) {
      return;
    }

    const isInVisibleSet = visibleDepartmentTypes.some(
      (type) => type.code === appointmentType,
    );

    if (!isInVisibleSet) {
      setAppointmentType("");
    }
  }, [appointmentType, visibleDepartmentTypes]);

  useEffect(() => {
    setSlot(null);
    setSlots([]);

    if (!open || !doctor || !appointmentType || !date) {
      return;
    }

    const seq = ++slotRequestSeq.current;

    startSlotsTransition(async () => {
      const result = await loadSlotsAction({
        doctorId: doctor.id,
        departmentId,
        date,
        type: appointmentType,
      });

      if (seq !== slotRequestSeq.current) {
        return;
      }

      if (!result.ok) {
        notifyRef.current.error(result.error.code);
        setSlots([]);

        return;
      }

      setSlots(result.data);
    });
  }, [open, doctor, appointmentType, date, departmentId]);

  // Reset all picks when the dialog closes so a re-open starts clean.
  useEffect(() => {
    if (open) {
      return;
    }

    setDoctor(lockedDoctor ?? null);
    setAppointmentType("");
    setDate(todayLocalISODate());
    setSlot(null);
    setSlots([]);
    setDepartmentTypes([]);
  }, [open, lockedDoctor]);

  const handleSubmit = useCallback(() => {
    if (!doctor) {
      notify.error(undefined, t(K.Referrals.BookDialog.missingDoctor));

      return;
    }

    if (!appointmentType) {
      notify.error(undefined, t(K.Referrals.BookDialog.missingType));

      return;
    }

    if (!date) {
      notify.error(undefined, t(K.Referrals.BookDialog.missingDate));

      return;
    }

    if (!slot) {
      notify.error(undefined, t(K.Referrals.BookDialog.missingSlot));

      return;
    }

    startSubmit(async () => {
      const result = await createAppointmentAction({
        patientId: referral.patient.id,
        doctorId: doctor.id,
        departmentId: slot.departmentId,
        scheduleId: slot.scheduleId,
        appointmentType,
        startAt: slot.startAt,
        previousAppointmentId: referral.id,
      });

      if (!result.ok) {
        notify.error(result.error.code, t(K.Referrals.BookDialog.genericError));

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.APPOINTMENT_CREATED);
      onClose();
      router.push(FE_PATH_BUILDER.appointmentDetail(result.data.id));
    });
  }, [
    doctor,
    appointmentType,
    date,
    slot,
    referral,
    notify,
    t,
    onClose,
    router,
  ]);

  const patientName = formatPatientFullName(referral.patient);
  const showSlotPanel =
    Boolean(doctor) && Boolean(appointmentType) && Boolean(date);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t(K.Referrals.BookDialog.title)}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Typography variant="body2" color="text.secondary">
            {t(K.Referrals.BookDialog.subtitle, { patientName })}
          </Typography>

          <DoctorSelect
            value={doctor}
            onChange={setDoctor}
            departmentId={doctorScopeDepartmentId ?? departmentId}
            initial={doctorSeed}
            label={t(K.Referrals.BookDialog.doctorLabel)}
            placeholder={t(K.Referrals.BookDialog.doctorPlaceholder)}
            required
            disabled={Boolean(lockedDoctor)}
            helperText={
              lockedDoctor
                ? t(K.Referrals.BookDialog.doctorLockedHelper)
                : undefined
            }
          />

          <AppointmentTypeSelect
            value={appointmentType}
            onChange={setAppointmentType}
            types={visibleDepartmentTypes}
            label={t(K.Referrals.BookDialog.typeLabel)}
            required
            disabled={visibleDepartmentTypes.length === 0}
          />

          <TextField
            type="date"
            required
            fullWidth
            label={t(K.Referrals.BookDialog.dateLabel)}
            helperText={t(K.Referrals.BookDialog.dateHelper)}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { min: todayLocalISODate() },
            }}
          />

          {showSlotPanel ? (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t(K.Referrals.BookDialog.slotsTitle)}
              </Typography>
              {isLoadingSlots ? (
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{ p: 1 }}
                >
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">
                    {t(K.Referrals.BookDialog.loadingSlots)}
                  </Typography>
                </Stack>
              ) : slots.length === 0 ? (
                <Alert severity="info" variant="outlined">
                  {t(K.Referrals.BookDialog.emptySlots)}
                </Alert>
              ) : (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {slots.map((option) => {
                    const selected =
                      slot?.scheduleId === option.scheduleId &&
                      slot?.startAt === option.startAt;
                    const label = `${dayjs(option.startAt)
                      .locale(locale)
                      .format("HH:mm")} – ${dayjs(option.endAt)
                      .locale(locale)
                      .format("HH:mm")}`;

                    return (
                      <Button
                        key={`${option.scheduleId}-${option.startAt}`}
                        variant={selected ? "contained" : "outlined"}
                        color="primary"
                        size="small"
                        onClick={() => setSlot(option)}
                        sx={{ minWidth: 110 }}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </Box>
              )}
            </Box>
          ) : (
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                p: 2,
                textAlign: "center",
                bgcolor: "background.default",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {t(K.Referrals.BookDialog.selectDoctorFirst)}
              </Typography>
            </Box>
          )}

          {slot ? (
            <Box
              sx={{
                border: 1,
                borderColor: "primary.light",
                borderRadius: 1,
                bgcolor: "primary.50",
                p: 1.5,
              }}
            >
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography variant="body2" fontWeight={600}>
                  {dayjs(slot.startAt)
                    .locale(locale)
                    .format("ddd, D MMM YYYY HH:mm")}
                </Typography>
                <Chip
                  size="small"
                  color="primary"
                  label={`${dayjs(slot.endAt).diff(slot.startAt, "minute")} min`}
                />
              </Stack>
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          {t(K.Referrals.BookDialog.cancel)}
        </Button>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {isSubmitting ? <CircularProgress size={18} /> : null}
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={isSubmitting || !slot}
          >
            {t(K.Referrals.BookDialog.submit)}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
