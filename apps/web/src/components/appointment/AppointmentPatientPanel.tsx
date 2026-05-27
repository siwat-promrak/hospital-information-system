import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { K, NS } from "@/i18n/keys.generated";
import { dayjs } from "@/lib/dayjs";
import type { PatientResponse } from "@/types/patient.types";

interface AppointmentPatientPanelProps {
  patient: PatientResponse;
  locale: string;
}

/**
 * F18 — read-only patient demographics panel rendered on the
 * appointment-detail page when the caller IS the appointment's doctor.
 *
 * Shows: name (en + th when present), HN, DOB, gender, blood group,
 * phone, emergency contact triplet, and address.
 */
export default async function AppointmentPatientPanel({
  patient,
  locale,
}: AppointmentPatientPanelProps) {
  const t = await getTranslations(NS.PatientsDetail);
  const tGender = await getTranslations(NS.CommonGender);
  const tBloodGroup = await getTranslations(NS.CommonBloodGroup);

  const nameEn = `${patient.firstNameEn} ${patient.lastNameEn}`.trim();

  const nameTh =
    patient.firstNameTh || patient.lastNameTh
      ? `${patient.firstNameTh ?? ""} ${patient.lastNameTh ?? ""}`.trim()
      : null;

  const displayName = nameTh ? `${nameEn} (${nameTh})` : nameEn;

  const dob = dayjs(patient.dateOfBirth).locale(locale).format("LL");

  const genderLabel = tGender(K.Common.Gender[patient.gender]);

  const bloodGroupLabel = tBloodGroup(K.Common.BloodGroup[patient.bloodGroup]);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            {t(K.Patients.Detail.title)}
          </Typography>

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
      </CardContent>
    </Card>
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
