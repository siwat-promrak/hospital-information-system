"use client";

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
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { followUpAppointmentAction } from "@/lib/api/appointment.actions";
import { loadSlotsAction } from "@/lib/api/slot.actions";
import { dayjs } from "@/lib/dayjs";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";
import type { SlotResponse } from "@/types/slot.types";

interface FollowUpDialogProps {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  doctorId: string;
  departmentId: string;
  /** Locale string passed down from the server component for dayjs formatting. */
  locale: string;
  note: string;
  drug: string | undefined;
  appointmentGroupId: string | null;
  onSuccess: () => void;
}

/**
 * F18 — Follow-up dialog. Date input → fetch
 * `getSlots({ doctorId, departmentId, date, type: FOLLOW_UP })` → slot
 * grid inline → Confirm. Confirms submit `{ startAt, note, drug? }` to
 * `followUpAppointmentAction`. Toast + refresh on success.
 *
 * The slot grid uses an inline list of `<Chip>` buttons (no paging) since
 * follow-up slots for a single doctor-day are rarely more than a dozen.
 */
export default function FollowUpDialog({
  open,
  onClose,
  appointmentId,
  doctorId,
  departmentId,
  locale,
  note,
  drug,
  appointmentGroupId: _appointmentGroupId,
  onSuccess,
}: FollowUpDialogProps) {
  const t = useTranslations(NS.FollowUp);
  const notify = useNotify();

  const today = dayjs().format("YYYY-MM-DD");

  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<readonly SlotResponse[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotResponse | null>(null);
  const [isLoadingSlots, startLoadTransition] = useTransition();
  const [isSubmitPending, startSubmitTransition] = useTransition();

  // `useNotify()` returns a fresh object literal every render — listing
  // `notify` in the effect's deps re-fires the effect every render, which
  // calls `startLoadTransition(...)` → setSlots → re-render → loop, and
  // the spinner never settles. Stash it behind a ref (mirroring
  // `SlotPicker`) so the inner async callback can still reach `.error()`
  // without subscribing to its identity.
  const notifyRef = useRef(notify);

  useEffect(() => {
    notifyRef.current = notify;
  });

  // Sequence guard so out-of-order responses don't clobber fresher slots.
  const requestSeq = useRef<number>(0);

  // Re-fetch slots whenever the date changes while the dialog is open.
  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedSlot(null);

    const seq = ++requestSeq.current;

    startLoadTransition(async () => {
      const result = await loadSlotsAction({
        doctorId,
        departmentId,
        date,
        type: "FOLLOW_UP",
      });

      if (seq !== requestSeq.current) {
        return;
      }

      if (!result.ok) {
        notifyRef.current.error(result.error.code);
        setSlots([]);

        return;
      }

      setSlots(result.data);
    });
  }, [date, open, doctorId, departmentId]);

  function handleClose() {
    setDate(today);
    setSlots([]);
    setSelectedSlot(null);
    onClose();
  }

  function handleConfirm() {
    if (!selectedSlot) {
      return;
    }

    startSubmitTransition(async () => {
      const result = await followUpAppointmentAction(appointmentId, {
        startAt: selectedSlot.startAt,
        note,
        drug: drug ?? null,
      });

      if (!result.ok) {
        notify.error(result.error.code);

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.APPOINTMENT_FOLLOWED_UP);
      handleClose();
      onSuccess();
    });
  }

  const isPending = isLoadingSlots || isSubmitPending;

  return (
    <Dialog
      open={open}
      onClose={() => (isPending ? null : handleClose())}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{t(K.FollowUp.dialogTitle)}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <TextField
            label={t(K.FollowUp.datePickerLabel)}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            fullWidth
            disabled={isPending}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { min: today },
            }}
          />

          {isLoadingSlots ? (
            <Stack alignItems="center" sx={{ py: 2 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : slots.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t(K.FollowUp.noSlots)}
            </Typography>
          ) : (
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {slots.map((slot) => (
                <Chip
                  key={slot.startAt}
                  label={dayjs(slot.startAt).locale(locale).format("HH:mm")}
                  onClick={() =>
                    setSelectedSlot(
                      selectedSlot?.startAt === slot.startAt ? null : slot,
                    )
                  }
                  color={
                    selectedSlot?.startAt === slot.startAt
                      ? "primary"
                      : "default"
                  }
                  variant={
                    selectedSlot?.startAt === slot.startAt
                      ? "filled"
                      : "outlined"
                  }
                  clickable
                  disabled={isSubmitPending}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isPending}>
          {t(K.FollowUp.dismiss)}
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="primary"
          disabled={isPending || !selectedSlot}
          startIcon={
            isSubmitPending ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {t(K.FollowUp.confirmAction)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
