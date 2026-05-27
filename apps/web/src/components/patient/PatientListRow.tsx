"use client";

import Avatar from "@mui/material/Avatar";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";

import { K, NS } from "@/i18n/keys.generated";
import { dayjs } from "@/lib/dayjs";
import { initialsFromName } from "@/lib/utils/initials";
import type { PatientResponse } from "@/types/patient.types";
import { formatPatientFullName } from "@/appointment/labels";

interface PatientListRowProps {
  patient: PatientResponse;
  onClick: () => void;
}

/**
 * One row in the patients directory list. Shows the patient's full name
 * (English primary, Thai in parentheses when present), HN, date of birth
 * (locale-formatted via dayjs), gender (from the shared `Common.Gender`
 * catalog), and phone number.
 *
 * The row is a `<ListItemButton>` whose `onClick` opens the read-only
 * patient-info dialog owned by `PatientListClient`. The list-row stays
 * presentational — open-state lives in the parent client wrapper so the
 * dialog can be mounted once for the whole list.
 */
export default function PatientListRow({
  patient,
  onClick,
}: PatientListRowProps) {
  const tList = useTranslations(NS.PatientsList);
  const tGender = useTranslations(NS.CommonGender);
  const locale = useLocale();

  const fullName = formatPatientFullName(patient);
  const initials = initialsFromName(
    `${patient.firstNameEn} ${patient.lastNameEn}`,
  );
  const dob = dayjs(patient.dateOfBirth).locale(locale).format("LL");

  const genderKey =
    patient.gender === "MALE" ? K.Common.Gender.MALE : K.Common.Gender.FEMALE;

  const ariaLabel = tList(K.Patients.List.viewDetailsAriaLabel, {
    name: fullName,
  });

  return (
    <ListItemButton
      onClick={onClick}
      aria-label={ariaLabel}
      sx={{ alignItems: "flex-start", py: 2 }}
    >
      <ListItemAvatar>
        <Avatar
          sx={{
            bgcolor: "primary.dark",
            color: "primary.contrastText",
            fontWeight: 600,
          }}
        >
          {initials}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        slotProps={{
          primary: { component: "div" },
          secondary: { component: "div" },
        }}
        primary={
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography component="span" sx={{ fontWeight: 600 }}>
              {fullName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tList(K.Patients.List.hnLabel)}: {patient.hn}
            </Typography>
          </Stack>
        }
        secondary={
          <Stack
            direction="row"
            spacing={2}
            flexWrap="wrap"
            sx={{ mt: 0.5 }}
          >
            <Typography variant="caption" color="text.secondary">
              {tList(K.Patients.List.dobLabel)}: {dob}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tList(K.Patients.List.genderLabel)}: {tGender(genderKey)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tList(K.Patients.List.phoneLabel)}: {patient.phone}
            </Typography>
          </Stack>
        }
      />
    </ListItemButton>
  );
}
