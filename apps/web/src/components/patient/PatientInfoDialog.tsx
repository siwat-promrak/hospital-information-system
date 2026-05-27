"use client";

import CloseIcon from "@mui/icons-material/Close";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import { formatPatientFullName } from "@/appointment/labels";
import { K, NS } from "@/i18n/keys.generated";
import { dayjs } from "@/lib/dayjs";
import type { PatientResponse } from "@/types/patient.types";

interface PatientInfoDialogProps {
  patient: PatientResponse | null;
  open: boolean;
  onClose: () => void;
  locale: string;
}

/**
 * Read-only patient demographics dialog opened from a `<PatientListRow>`
 * click. Mirrors the field layout of `<AppointmentPatientPanel>` so the
 * doctor-facing appointment surface and the patients-directory surface
 * stay in lockstep — same labels, same key namespace (`K.Patients.Detail`).
 *
 * The body renders nothing when `patient` is `null` so the dialog can
 * stay mounted while animating shut without crashing on a stale prop.
 */
export default function PatientInfoDialog({
  patient,
  open,
  onClose,
  locale,
}: PatientInfoDialogProps) {
  const t = useTranslations(NS.PatientsDetail);
  const tGender = useTranslations(NS.CommonGender);
  const tBloodGroup = useTranslations(NS.CommonBloodGroup);

  if (!patient) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>{t(K.Patients.Detail.title)}</DialogTitle>
        <DialogActions>
          <Button onClick={onClose}>
            {t(K.Patients.Detail.dialogCloseLabel)}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  const displayName = formatPatientFullName(patient);
  const dob = dayjs(patient.dateOfBirth).locale(locale).format("LL");
  const genderLabel = tGender(K.Common.Gender[patient.gender]);
  const bloodGroupLabel = tBloodGroup(K.Common.BloodGroup[patient.bloodGroup]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6 }}>
        {t(K.Patients.Detail.title)}
        <IconButton
          aria-label={t(K.Patients.Detail.dialogCloseLabel)}
          onClick={onClose}
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
            color: "text.secondary",
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          <PatientDetailRow
            label={t(K.Patients.Detail.nameLabel)}
            value={displayName}
          />
          <PatientDetailRow
            label={t(K.Patients.Detail.hnLabel)}
            value={patient.hn}
          />
          <PatientDetailRow
            label={t(K.Patients.Detail.dobLabel)}
            value={dob}
          />
          <PatientDetailRow
            label={t(K.Patients.Detail.genderLabel)}
            value={genderLabel}
          />
          <PatientDetailRow
            label={t(K.Patients.Detail.bloodGroupLabel)}
            value={bloodGroupLabel}
          />
          <PatientDetailRow
            label={t(K.Patients.Detail.identificationNoLabel)}
            value={patient.identificationNo}
          />
          <PatientDetailRow
            label={t(K.Patients.Detail.phoneLabel)}
            value={patient.phone}
          />
          <PatientDetailRow
            label={t(K.Patients.Detail.emergencyPersonNameLabel)}
            value={patient.emergencyPersonName}
          />
          <PatientDetailRow
            label={t(K.Patients.Detail.emergencyPersonRelationLabel)}
            value={patient.emergencyPersonRelation}
          />
          <PatientDetailRow
            label={t(K.Patients.Detail.emergencyPersonPhoneLabel)}
            value={patient.emergencyPersonPhone}
          />
          <PatientDetailRow
            label={t(K.Patients.Detail.addressLabel)}
            value={patient.address}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {t(K.Patients.Detail.dialogCloseLabel)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface PatientDetailRowProps {
  label: string;
  value: string;
}

function PatientDetailRow({ label, value }: PatientDetailRowProps) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.25, sm: 2 }}
      alignItems={{ xs: "flex-start", sm: "baseline" }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: 200 }}
      >
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}
