"use client";

import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import DepartmentSelect from "@/components/shared/select/DepartmentSelect";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import {
  completeAppointmentAction,
  referAppointmentAction,
} from "@/lib/api/appointment.actions";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";
import type { DepartmentRow } from "@/types/department.types";

import FollowUpDialog from "./FollowUpDialog";

interface WorkspaceNotePanelProps {
  appointmentId: string;
  doctorId: string;
  departmentId: string;
  sourceDepartmentId: string;
  departments: readonly DepartmentRow[];
  appointmentGroupId: string | null;
  /** Locale string for slot time formatting in FollowUpDialog. */
  locale: string;
}

/**
 * F17 — "use client" workspace panel with a required note textarea, an
 * optional drug textarea, and three end-of-visit action buttons. The
 * buttons are disabled until `note.trim().length > 0`.
 *
 * Complete — confirmation dialog → calls `completeAppointmentAction`.
 * Follow Up — opens `FollowUpDialog` → calls `followUpAppointmentAction`.
 * Refer — opens refer dialog → calls `referAppointmentAction`.
 *
 * All three actions pass `{ note, drug? }` to the BE; the BE creates the
 * medical-records row in the same transaction. This panel only renders when
 * the appointment is BOOKED (the parent page guards on status).
 */
export default function WorkspaceNotePanel({
  appointmentId,
  doctorId,
  departmentId,
  sourceDepartmentId,
  departments,
  appointmentGroupId,
  locale,
}: WorkspaceNotePanelProps) {
  const t = useTranslations(NS.WorkspacePanel);
  const tAppointment = useTranslations(NS.AppointmentsDetail);
  const router = useRouter();
  const notify = useNotify();

  const [note, setNote] = useState("");
  const [drug, setDrug] = useState("");

  // Complete dialog state
  const [completeOpen, setCompleteOpen] = useState(false);
  const [isCompletePending, startCompleteTransition] = useTransition();

  // Follow-up dialog state
  const [followUpOpen, setFollowUpOpen] = useState(false);

  // Refer dialog state
  const [referOpen, setReferOpen] = useState(false);
  const [referTarget, setReferTarget] = useState<string | "">("");
  const [isReferPending, startReferTransition] = useTransition();

  const hasNote = note.trim().length > 0;
  const drugValue = drug.trim().length > 0 ? drug.trim() : undefined;

  const filteredDepartments = departments.filter(
    (d) => d.id !== sourceDepartmentId,
  );

  function handleCompleteConfirm() {
    startCompleteTransition(async () => {
      const result = await completeAppointmentAction(appointmentId, {
        note: note.trim(),
        drug: drugValue ?? null,
      });

      if (!result.ok) {
        notify.error(result.error.code);

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.APPOINTMENT_COMPLETED);
      setCompleteOpen(false);
      router.refresh();
    });
  }

  function resetRefer() {
    setReferTarget("");
    setReferOpen(false);
  }

  function handleReferConfirm() {
    if (!referTarget) {
      return;
    }

    startReferTransition(async () => {
      const result = await referAppointmentAction(appointmentId, {
        referredToDepartmentId: referTarget,
        note: note.trim(),
        drug: drugValue ?? null,
      });

      if (!result.ok) {
        notify.error(result.error.code);

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.APPOINTMENT_REFERRED);
      resetRefer();
      router.refresh();
    });
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2.5}>
          <Typography variant="h6" component="h2">
            {t(K.WorkspacePanel.noteLabel)}
          </Typography>

          <TextField
            label={t(K.WorkspacePanel.noteLabel)}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={4}
            fullWidth
            required
            helperText={
              !hasNote ? t(K.WorkspacePanel.noteRequired) : undefined
            }
          />

          <TextField
            label={t(K.WorkspacePanel.drugLabel)}
            value={drug}
            onChange={(e) => setDrug(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            justifyContent="flex-end"
          >
            <Button
              type="button"
              variant="contained"
              color="success"
              disabled={!hasNote}
              onClick={() => setCompleteOpen(true)}
            >
              {t(K.WorkspacePanel.completeAction)}
            </Button>

            <Button
              type="button"
              variant="outlined"
              color="primary"
              disabled={!hasNote}
              onClick={() => setFollowUpOpen(true)}
            >
              {t(K.WorkspacePanel.followUpAction)}
            </Button>

            <Button
              type="button"
              variant="outlined"
              color="primary"
              disabled={!hasNote}
              onClick={() => setReferOpen(true)}
            >
              {t(K.WorkspacePanel.referAction)}
            </Button>
          </Stack>
        </Stack>
      </CardContent>

      {/* Complete confirmation dialog */}
      <Dialog
        open={completeOpen}
        onClose={() => (isCompletePending ? null : setCompleteOpen(false))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {tAppointment(K.Appointments.Detail.completeDialogTitle)}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {tAppointment(K.Appointments.Detail.completeDialogBody)}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setCompleteOpen(false)}
            disabled={isCompletePending}
          >
            {tAppointment(K.Appointments.Detail.completeDismiss)}
          </Button>
          <Button
            onClick={handleCompleteConfirm}
            variant="contained"
            color="success"
            disabled={isCompletePending}
            startIcon={
              isCompletePending ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {tAppointment(K.Appointments.Detail.completeConfirm)}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Follow-up dialog */}
      <FollowUpDialog
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        appointmentId={appointmentId}
        doctorId={doctorId}
        departmentId={departmentId}
        locale={locale}
        note={note.trim()}
        drug={drugValue}
        appointmentGroupId={appointmentGroupId}
        onSuccess={() => {
          setFollowUpOpen(false);
          router.refresh();
        }}
      />

      {/* Refer dialog */}
      <Dialog
        open={referOpen}
        onClose={() => (isReferPending ? null : resetRefer())}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {tAppointment(K.Appointments.Detail.referDialogTitle)}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <DialogContentText>
              {tAppointment(K.Appointments.Detail.referDialogBody)}
            </DialogContentText>
            <DepartmentSelect
              value={referTarget}
              onChange={setReferTarget}
              departments={filteredDepartments}
              label={tAppointment(K.Appointments.Detail.referTargetLabel)}
              required
              disabled={isReferPending}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetRefer} disabled={isReferPending}>
            {tAppointment(K.Appointments.Detail.referDismiss)}
          </Button>
          <Button
            onClick={handleReferConfirm}
            variant="contained"
            color="primary"
            disabled={isReferPending || !referTarget}
            startIcon={
              isReferPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {tAppointment(K.Appointments.Detail.referConfirm)}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
