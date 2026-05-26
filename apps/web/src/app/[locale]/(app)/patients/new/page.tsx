import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PERMISSION_CODE } from "@/auth/permissions";
import PatientRegistrationForm from "@/components/patient/PatientRegistrationForm";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { hasPermission, requireSession } from "@/lib/server/session";

interface PatientRegistrationPageProps {
  params: Promise<{ locale: AppLocale }>;
}

/**
 * F09 walk-in patient registration page (`/patients/new`). Renders a
 * single form-card; on success the form fires
 * `createPatientAction`, shows a toast carrying the minted HN, and
 * navigates back to the previous page (or the appointments list when
 * launched directly from the dashboard).
 *
 * Auth: gated on `patient.create` — NURSE + MEDICAL_RECORDS_OFFICER hold
 * it in the seeded baseline. Other callers (DOCTOR, PHARMACY) get the
 * shared "forbidden" card so the route is discoverable as not-for-them
 * without rendering a half-broken form.
 */
export default async function PatientRegistrationPage({
  params,
}: PatientRegistrationPageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const tRegister = await getTranslations(NS.PatientsRegister);
  const tErrors = await getTranslations(NS.PatientsRegisterErrors);

  if (!hasPermission(session, PERMISSION_CODE.PATIENT_CREATE)) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.Patients.Register.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1" color="primary">
          {tRegister(K.Patients.Register.title)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {tRegister(K.Patients.Register.subtitle)}
        </Typography>
      </Box>
      <PatientRegistrationForm />
    </Stack>
  );
}
