"use client";

import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import DepartmentSelect from "@/components/shared/select/DepartmentSelect";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { referAppointmentAction } from "@/lib/api/appointment.actions";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";
import type { DepartmentRow } from "@/types/department.types";

interface AppointmentReferButtonProps {
  appointmentId: string;
  /**
   * Department catalog — passed in from the page-level fetch so the modal
   * doesn't re-fetch it on open. The catalog is small (~10 rows for the
   * project) so the full list ships in the initial RSC payload.
   */
  departments: readonly DepartmentRow[];
  /**
   * Department this appointment lives in — excluded from the modal's
   * options because referring to one's own department is a no-op the
   * BE rejects with `REFERRAL_DEPARTMENT_MISMATCH`.
   */
  sourceDepartmentId: string;
}

/**
 * F14 — doctor-only "send this patient to another department" action.
 * Modal hosts a `<DepartmentSelect>` filtered to non-source departments
 * and a confirm/cancel pair. Submit fires
 * `POST /appointments/:id/refer { toDepartmentId }`; success refreshes
 * the detail page so the referral chip + locked actions appear.
 *
 * Surfaces the standard error toasts via `notify.error(result.error.code)`
 * — `APPOINTMENT_ALREADY_REFERRED`, `REFERRAL_DEPARTMENT_MISMATCH`,
 * `APPOINTMENT_NOT_BOOKED`, etc.
 */
export default function AppointmentReferButton({
  appointmentId,
  departments,
  sourceDepartmentId,
}: AppointmentReferButtonProps) {
  const t = useTranslations(NS.AppointmentsDetail);
  const router = useRouter();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | "">("");
  const [isPending, startTransition] = useTransition();

  const filteredDepartments = departments.filter(
    (d) => d.id !== sourceDepartmentId,
  );

  function reset() {
    setTarget("");
    setOpen(false);
  }

  function handleConfirm() {
    if (!target) {
      return;
    }

    startTransition(async () => {
      const result = await referAppointmentAction(appointmentId, {
        toDepartmentId: target,
      });

      if (!result.ok) {
        notify.error(result.error.code);

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.APPOINTMENT_REFERRED);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outlined"
        color="primary"
        onClick={() => setOpen(true)}
      >
        {t(K.Appointments.Detail.referAction)}
      </Button>
      <Dialog
        open={open}
        onClose={() => (isPending ? null : reset())}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t(K.Appointments.Detail.referDialogTitle)}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <DialogContentText>
              {t(K.Appointments.Detail.referDialogBody)}
            </DialogContentText>
            <DepartmentSelect
              value={target}
              onChange={setTarget}
              departments={filteredDepartments}
              label={t(K.Appointments.Detail.referTargetLabel)}
              required
              disabled={isPending}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={reset} disabled={isPending}>
            {t(K.Appointments.Detail.referDismiss)}
          </Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            color="primary"
            disabled={isPending || !target}
            startIcon={
              isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {t(K.Appointments.Detail.referConfirm)}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
