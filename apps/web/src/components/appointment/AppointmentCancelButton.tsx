"use client";

import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { cancelAppointmentAction } from "@/lib/api/appointment.actions";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";

interface AppointmentCancelButtonProps {
  appointmentId: string;
}

/**
 * Cancel-appointment affordance for the F09 appointment detail page.
 * Opens a confirmation dialog with a REQUIRED free-text reason; on
 * confirm fires `cancelAppointmentAction` and refreshes the page so the
 * detail card flips into its CANCELLED state (the action also
 * `revalidatePath`s the list page).
 *
 * The BE rejects empty / whitespace-only reasons with
 * `400 VALIDATION_FAILED`; the dialog mirrors that contract by disabling
 * the Confirm button until the user types something non-empty.
 *
 * Specific BE error codes (`APPOINTMENT_ALREADY_CANCELLED`,
 * `APPOINTMENT_ALREADY_COMPLETED`) map to localised toasts via the
 * shared notifier — the dialog stays open on error so the user can
 * dismiss it deliberately.
 */
export default function AppointmentCancelButton({
  appointmentId,
}: AppointmentCancelButtonProps) {
  const t = useTranslations(NS.AppointmentsDetail);
  const router = useRouter();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const trimmedReason = reason.trim();
  const isReasonEmpty = trimmedReason.length === 0;

  function handleConfirm() {
    startTransition(async () => {
      const result = await cancelAppointmentAction(appointmentId, {
        cancellationReason: trimmedReason,
      });

      if (!result.ok) {
        notify.error(result.error.code);

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.APPOINTMENT_CANCELLED);
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ pt: 2 }}>
        <Button
          variant="outlined"
          color="error"
          onClick={() => setOpen(true)}
        >
          {t(K.Appointments.Detail.cancelAction)}
        </Button>
      </Stack>
      <Dialog
        open={open}
        onClose={() => (isPending ? null : setOpen(false))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t(K.Appointments.Detail.cancelDialogTitle)}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <DialogContentText>
              {t(K.Appointments.Detail.cancelDialogBody)}
            </DialogContentText>
            <TextField
              label={t(K.Appointments.Detail.cancelReasonLabel)}
              placeholder={t(K.Appointments.Detail.cancelReasonPlaceholder)}
              multiline
              minRows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              fullWidth
              required
              error={isReasonEmpty}
              helperText={
                isReasonEmpty
                  ? t(K.Appointments.Detail.cancelReasonRequired)
                  : undefined
              }
              disabled={isPending}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            {t(K.Appointments.Detail.cancelDismiss)}
          </Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            color="error"
            disabled={isPending || isReasonEmpty}
            startIcon={
              isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {t(K.Appointments.Detail.cancelConfirm)}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
