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
import { closeAppointmentGroupAction } from "@/lib/api/appointment-group.actions";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";

interface AppointmentCloseCaseButtonProps {
  appointmentGroupId: string;
}

/**
 * F14 — doctor-only "close this case" affordance, surfaced on the
 * appointment detail page when:
 *   1. The appointment is part of a group (`appointmentGroupId !== null`).
 *   2. The caller is the doctor of the group's latest non-cancelled
 *      visit (the BE re-checks this and 403s with
 *      `APPOINTMENT_GROUP_CLOSE_FORBIDDEN` otherwise).
 *
 * The "latest doctor only" rule lives on the BE and is what the
 * forbidden code communicates; the FE intentionally still SHOWS the
 * button to any group member so the doctor doesn't have to navigate to
 * the latest visit just to close the case — they get a clear error if
 * they aren't authorised.
 */
export default function AppointmentCloseCaseButton({
  appointmentGroupId,
}: AppointmentCloseCaseButtonProps) {
  const t = useTranslations(NS.AppointmentsDetail);
  const router = useRouter();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await closeAppointmentGroupAction(appointmentGroupId);

      if (!result.ok) {
        notify.error(result.error.code);

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.APPOINTMENT_GROUP_CLOSED);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outlined"
        color="warning"
        onClick={() => setOpen(true)}
      >
        {t(K.Appointments.Detail.closeCaseAction)}
      </Button>
      <Dialog
        open={open}
        onClose={() => (isPending ? null : setOpen(false))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {t(K.Appointments.Detail.closeCaseDialogTitle)}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t(K.Appointments.Detail.closeCaseDialogBody)}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={isPending}>
            {t(K.Appointments.Detail.closeCaseDismiss)}
          </Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            color="warning"
            disabled={isPending}
            startIcon={
              isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {t(K.Appointments.Detail.closeCaseConfirm)}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
