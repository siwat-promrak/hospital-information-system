import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PERMISSION_CODE } from "@/auth/permissions";
import AppointmentPatientPanel from "@/components/appointment/AppointmentPatientPanel";
import AppointmentVisitThread from "@/components/appointment/AppointmentVisitThread";
import BackToWorkspaceButton from "@/components/appointment/BackToWorkspaceButton";
import WorkspaceNotePanel from "@/components/appointment/WorkspaceNotePanel";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { getAppointment } from "@/lib/api/appointment.api";
import { APPOINTMENT_ERROR_CODE } from "@/lib/api/appointment.const";
import { getMe } from "@/lib/api/auth.api";
import { listDepartments } from "@/lib/api/department.api";
import { getPatient } from "@/lib/api/patient.api";
import { DEFAULT_PAGE, MAX_PAGE_SIZE } from "@/lib/api/pagination.const";
import { dayjs } from "@/lib/dayjs";
import { hasPermission, requireSession } from "@/lib/server/session";
import { isApiError } from "@/lib/api/errors";
import {
  formatDoctorFullName,
  formatPatientFullName,
} from "@/appointment/labels";

interface WorkspaceDetailPageProps {
  params: Promise<{ locale: AppLocale; id: string }>;
}

/**
 * F18 — dedicated doctor workspace detail page (`/workspace/:id`).
 *
 * Gated on `doctor_workspace.read.own`. After that gate, also verifies
 * that `me.doctor.id === appointment.doctorId` — if not, renders a
 * not-found card (no existence leak).
 *
 * Renders:
 * - "Back to workspace" button
 * - Appointment summary card (patient name, chips, detail rows)
 * - `AppointmentPatientPanel` (full demographics)
 * - `AppointmentVisitThread` (read-only medical records) when the visit
 *   is grouped (full case history) OR is a past visit (so a completed
 *   standalone visit still surfaces its own record)
 * - `WorkspaceNotePanel` (Complete / Follow Up / Refer) only when
 *   `appointment.status === 'BOOKED'`; completed/cancelled show a
 *   read-only status alert instead
 */
export default async function WorkspaceDetailPage({
  params,
}: WorkspaceDetailPageProps) {
  const { locale, id } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.Workspace);
  const tDetail = await getTranslations(NS.AppointmentsDetail);
  const tErrors = await getTranslations(NS.AppointmentsErrors);
  const tType = await getTranslations(NS.CommonAppointmentType);
  const tStatus = await getTranslations(NS.CommonAppointmentStatus);

  const canAccess = hasPermission(
    session,
    PERMISSION_CODE.DOCTOR_WORKSPACE_READ_OWN,
  );

  if (!canAccess) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.Appointments.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  let appointment;

  try {
    appointment = await getAppointment(id);
  } catch (err) {
    if (
      isApiError(err) &&
      (err.status === 404 ||
        err.code === APPOINTMENT_ERROR_CODE.APPOINTMENT_NOT_FOUND)
    ) {
      return (
        <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Stack spacing={2} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              {tDetail(K.Appointments.Detail.notFound)}
            </Typography>
            <BackToWorkspaceButton
              label={t(K.Workspace.back)}
            />
          </Stack>
        </Card>
      );
    }

    throw err;
  }

  // Verify the caller IS this appointment's doctor — no existence leak.
  const me = await getMe();
  const isCallerDoctor =
    me.doctor?.id !== undefined && me.doctor.id === appointment.doctorId;

  if (!isCallerDoctor) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Stack spacing={2} alignItems="center">
          <Typography variant="body2" color="text.secondary">
            {tDetail(K.Appointments.Detail.notFound)}
          </Typography>
          <BackToWorkspaceButton
            label={t(K.Workspace.back)}
          />
        </Stack>
      </Card>
    );
  }

  const isBooked = appointment.status === "BOOKED";

  // Full patient row for the demographics panel.
  const patient = await getPatient(appointment.patientId);

  // Department catalog — needed for the Refer modal (BOOKED) and the
  // referred-to chip (any status when `referredToDepartmentId` is set).
  const needsDeptCatalog =
    isBooked || appointment.referredToDepartmentId !== null;
  const departmentsResult = needsDeptCatalog
    ? await listDepartments({ page: DEFAULT_PAGE, pageSize: MAX_PAGE_SIZE })
    : null;

  const start = dayjs(appointment.startAt).locale(locale);
  const end = dayjs(appointment.endAt).locale(locale);

  return (
    <Stack spacing={3}>
      <BackToWorkspaceButton
        label={t(K.Workspace.back)}
        sx={{ alignSelf: "flex-start" }}
      />

      {appointment.status === "CANCELLED" ? (
        <Alert severity="warning">
          {tDetail(K.Appointments.Detail.alreadyCancelled)}
        </Alert>
      ) : null}
      {appointment.status === "COMPLETED" ? (
        <Alert severity="info">
          {tDetail(K.Appointments.Detail.alreadyCompleted)}
        </Alert>
      ) : null}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2.5}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "flex-start", sm: "center" }}
              justifyContent="space-between"
            >
              <Typography variant="h5" component="h1">
                {formatPatientFullName(appointment.patient)}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip
                  label={tType(appointment.appointmentType)}
                  variant="outlined"
                />
                <Chip
                  label={tStatus(appointment.status)}
                  color={
                    appointment.status === "BOOKED"
                      ? "primary"
                      : appointment.status === "CANCELLED"
                        ? "default"
                        : "success"
                  }
                />
                {appointment.referredToDepartmentId ? (
                  <Chip
                    label={tDetail(K.Appointments.Detail.referredBadge, {
                      departmentName:
                        departmentsResult?.data.find(
                          (d) => d.id === appointment.referredToDepartmentId,
                        )?.name ?? "",
                    })}
                    variant="outlined"
                    color="info"
                  />
                ) : null}
              </Stack>
            </Stack>

            <WorkspaceDetailRow
              label={tDetail(K.Appointments.Detail.hnLabel)}
              value={appointment.patient.hn}
            />
            <WorkspaceDetailRow
              label={tDetail(K.Appointments.Detail.doctorLabel)}
              value={`${formatDoctorFullName(appointment.doctor)} (${appointment.doctor.doctorCode})`}
            />
            <WorkspaceDetailRow
              label={tDetail(K.Appointments.Detail.departmentLabel)}
              value={appointment.department.name}
            />
            <WorkspaceDetailRow
              label={tDetail(K.Appointments.Detail.startsAt)}
              value={start.format("dddd, D MMMM YYYY HH:mm")}
            />
            <WorkspaceDetailRow
              label={tDetail(K.Appointments.Detail.endsAt)}
              value={end.format("dddd, D MMMM YYYY HH:mm")}
            />
            <WorkspaceDetailRow
              label={tDetail(K.Appointments.Detail.reasonLabel)}
              value={
                appointment.reason && appointment.reason.length > 0
                  ? appointment.reason
                  : tDetail(K.Appointments.Detail.noReason)
              }
            />
          </Stack>
        </CardContent>
      </Card>

      <AppointmentPatientPanel patient={patient} locale={locale} />

      {/* Read-only medical records. Rendered when the visit is grouped
          (full case history) OR when it is a past visit (so a completed
          standalone visit still surfaces its own record). A BOOKED
          standalone visit has no record yet, so it's omitted there. */}
      {appointment.appointmentGroupId || !isBooked ? (
        <AppointmentVisitThread
          appointmentId={appointment.id}
          appointmentGroupId={appointment.appointmentGroupId}
          locale={locale}
        />
      ) : null}

      {isBooked ? (
        <WorkspaceNotePanel
          appointmentId={appointment.id}
          doctorId={appointment.doctorId}
          departmentId={appointment.departmentId}
          sourceDepartmentId={appointment.departmentId}
          departments={departmentsResult?.data ?? []}
          appointmentGroupId={appointment.appointmentGroupId}
          locale={locale}
        />
      ) : null}
    </Stack>
  );
}

interface WorkspaceDetailRowProps {
  label: string;
  value: string;
}

function WorkspaceDetailRow({ label, value }: WorkspaceDetailRowProps) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.25, sm: 2 }}
      alignItems={{ xs: "flex-start", sm: "baseline" }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: 160 }}
      >
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}
