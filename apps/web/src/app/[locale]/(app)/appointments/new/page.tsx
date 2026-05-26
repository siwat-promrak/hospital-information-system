import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PERMISSION_CODE } from "@/auth/permissions";
import BookingWizard from "@/components/appointment/BookingWizard";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { getAppointment } from "@/lib/api/appointment.api";
import { APPOINTMENT_ERROR_CODE } from "@/lib/api/appointment.const";
import { getMe } from "@/lib/api/auth.api";
import { listDepartments } from "@/lib/api/department.api";
import { fetchDoctorPickerSeed } from "@/lib/api/doctor.actions";
import { getDoctor } from "@/lib/api/doctor.api";
import { isApiError } from "@/lib/api/errors";
import { DEFAULT_PAGE, MAX_PAGE_SIZE } from "@/lib/api/pagination.const";
import { hasPermission, requireSession } from "@/lib/server/session";
import type { AppointmentResponse } from "@/types/appointment.types";
import type { DoctorListRow } from "@/types/doctor.types";

interface BookingWizardPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{
    /**
     * F14 — referrals queue deep-link. Resolved into the
     * `referralSourceAppointment` prop on the wizard so the patient is
     * pre-filled and the continuation step is skipped. Unrecoverable
     * lookups (cancelled appointment, foreign-tenant id) degrade
     * gracefully: the wizard mounts without the seed instead of
     * 4xx-ing the entire page.
     */
    previousAppointmentId?: string;
  }>;
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
  searchParams,
}: BookingWizardPageProps) {
  const { locale } = await params;
  const { previousAppointmentId } = await searchParams;

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

  // Effective create scope. When the caller holds `.own` ONLY (no
  // `.own-department`, no `.all`) the BE forces the doctor to the
  // caller's own row anyway — pre-fill + lock the picker so the user
  // doesn't pick a value the BE will overwrite. This matches the seeded
  // DOCTOR role; NURSE (`.own-department`) and any future `.all` caller
  // keep an open picker. Mirrors the schedule page's `lockedDoctorId`
  // pattern (see `/schedules/page.tsx` around the `lockedDoctorId`
  // computation).
  const isCreateOwnOnly =
    hasPermission(session, PERMISSION_CODE.APPOINTMENT_CREATE_OWN) &&
    !hasPermission(
      session,
      PERMISSION_CODE.APPOINTMENT_CREATE_OWN_DEPARTMENT,
    );

  // Resolve the caller's own doctor row before kicking off the parallel
  // SSR fetch — the wizard needs the full `DoctorListRow` shape (not
  // just the id) so the picker can render the locked selection inline
  // without a follow-up fetch. `getMe()` returns the thin doctor ref
  // (`{ id, departmentId }`) and `getDoctor(id)` returns the full row.
  // Any 403/404 bubbles up to `(app)/error.tsx`.
  let lockedDoctor: DoctorListRow | undefined;

  if (isCreateOwnOnly) {
    const me = await getMe();

    if (me.doctor) {
      lockedDoctor = await getDoctor(me.doctor.id);
    }
  }

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
  // F14 — when the referrals queue deep-links to the wizard, resolve
  // the source appointment server-side so the wizard's prefill state is
  // populated without a client round-trip. A 404 / 403 here means the
  // referenced appointment is no longer readable (cancelled, moved
  // tenants, never existed) — degrade by dropping the seed and letting
  // the wizard run as a fresh booking. The user can still pick the
  // continuation themselves on step 2.
  let referralSourceAppointment: AppointmentResponse | undefined;

  if (previousAppointmentId) {
    try {
      referralSourceAppointment = await getAppointment(previousAppointmentId);

      if (referralSourceAppointment.status === "CANCELLED") {
        referralSourceAppointment = undefined;
      }
    } catch (err) {
      if (
        isApiError(err) &&
        (err.status === 404 ||
          err.status === 403 ||
          err.code === APPOINTMENT_ERROR_CODE.APPOINTMENT_NOT_FOUND)
      ) {
        referralSourceAppointment = undefined;
      } else {
        throw err;
      }
    }
  }

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
        lockedDoctor={lockedDoctor}
        canRegisterPatient={canRegisterPatient}
        referralSourceAppointment={referralSourceAppointment}
      />
    </Stack>
  );
}
