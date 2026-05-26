import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PERMISSION_CODE } from "@/auth/permissions";
import BookingWizard from "@/components/appointment/BookingWizard";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { listDepartments } from "@/lib/api/department.api";
import { fetchDoctorPickerSeed } from "@/lib/api/doctor.actions";
import { DEFAULT_PAGE, MAX_PAGE_SIZE } from "@/lib/api/pagination.const";
import { hasPermission, requireSession } from "@/lib/server/session";

interface BookingWizardPageProps {
  params: Promise<{ locale: AppLocale }>;
}

/**
 * F09 booking-wizard entry point (`/appointments/new`).
 *
 * The page does the heavy lifting on the server: loads the appointment-
 * type catalog, the department list, and the first page of doctors
 * (auto-narrowed to the caller's department for department-scoped
 * roles). The wizard client component then steps the user through
 * patient → slot → confirm.
 *
 * Auth: gated on either `appointment.create.own` (DOCTOR self-booking)
 * or `appointment.create.own-department` (NURSE department booking).
 * Other callers get the shared "forbidden" card so the route is
 * discoverable as not-for-them.
 */
export default async function BookingWizardPage({
  params,
}: BookingWizardPageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const tWizard = await getTranslations(NS.BookingWizard);
  const tErrors = await getTranslations(NS.BookingWizardErrors);

  const canBook = hasPermission(
    session,
    PERMISSION_CODE.APPOINTMENT_CREATE_OWN,
    PERMISSION_CODE.APPOINTMENT_CREATE_OWN_DEPARTMENT,
  );

  if (!canBook) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.BookingWizard.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  // The "Register new patient" CTA on step 1 of the wizard jumps out to
  // `/patients/new`. Gate the CTA on the same permission the patient-
  // create route enforces so a DOCTOR (who can book but not register)
  // doesn't see a link that would 403 on click.
  const canRegisterPatient = hasPermission(
    session,
    PERMISSION_CODE.PATIENT_CREATE,
  );

  // Department-scoped roles (NURSE) only book inside their own department
  // — narrow the doctor picker accordingly so the wizard's BE call
  // doesn't trip the scope guard. DOCTOR (`.own`) auto-narrows to their
  // own record server-side; the picker stays scoped to their department
  // so cross-coverage doctors don't appear.
  const callerDepartmentId = session.user.departmentId ?? undefined;

  // Any 403/404 from the two BE fetches below bubbles up to
  // `(app)/error.tsx`, which renders the right friendly card based on
  // the `ApiError.digest` prefix — no per-page try/catch needed.
  //
  // Note: the appointment-type catalog used to be a third SSR fetch
  // here, but F13 moved per-pair duration + booking-window onto the
  // per-department endpoint. The wizard now fetches
  // `GET /departments/:id/appointment-types` client-side once a
  // department is picked, so the SSR shape no longer needs the global
  // label catalog.
  const [departments, doctorSeed] = await Promise.all([
    listDepartments({ page: DEFAULT_PAGE, pageSize: MAX_PAGE_SIZE }),
    fetchDoctorPickerSeed({ departmentId: callerDepartmentId }),
  ]);

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1" color="primary">
          {tWizard(K.BookingWizard.title)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {tWizard(K.BookingWizard.subtitle)}
        </Typography>
      </Stack>
      <BookingWizard
        departments={departments.data}
        doctorSeed={doctorSeed}
        doctorScopeDepartmentId={callerDepartmentId}
        forcedDepartmentId={callerDepartmentId}
        canRegisterPatient={canRegisterPatient}
      />
    </Stack>
  );
}
