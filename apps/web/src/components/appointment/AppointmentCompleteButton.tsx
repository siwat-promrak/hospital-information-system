"use client";

import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { completeAppointmentAction } from "@/lib/api/appointment.actions";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";

interface AppointmentCompleteButtonProps {
  appointmentId: string;
}

/**
 * F14 — doctor-only "mark this appointment as completed" affordance.
 * Confirmation dialog gates the call so a stray click doesn't lock the
 * row; on confirm the action fires `POST /appointments/:id/complete` and
 * the page refreshes (the action revalidates the detail + list paths).
 *
 * BE error narrowing happens via the global toast catalog —
 * `APPOINTMENT_ALREADY_COMPLETED`, `APPOINTMENT_NOT_BOOKED`,
 * `INSUFFICIENT_PERMISSION` all already have entries.
 */
export default function AppointmentCompleteButton({
  appointmentId,
}: AppointmentCompleteButtonProps) {
  const t = useTranslations(NS.AppointmentsDetail);
  const router = useRouter();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await completeAppointmentAction(appointmentId);

      if (!result.ok) {
        notify.error(result.error.code);

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.APPOINTMENT_COMPLETED);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="contained"
        color="success"
        onClick={() => setOpen(true)}
      >
        {t(K.Appointments.Detail.completeAction)}
      </Button>
      <Dialog
        open={open}
        onClose={() => (isPending ? null : setOpen(false))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {t(K.Appointments.Detail.completeDialogTitle)}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t(K.Appointments.Detail.completeDialogBody)}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={isPending}>
            {t(K.Appointments.Detail.completeDismiss)}
          </Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            color="success"
            disabled={isPending}
            startIcon={
              isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {t(K.Appointments.Detail.completeConfirm)}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
