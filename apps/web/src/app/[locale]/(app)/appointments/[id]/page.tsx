import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PERMISSION_CODE } from "@/auth/permissions";
import AppointmentCancelButton from "@/components/appointment/AppointmentCancelButton";
import BackToAppointmentsButton from "@/components/appointment/BackToAppointmentsButton";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { getAppointment } from "@/lib/api/appointment.api";
import { APPOINTMENT_ERROR_CODE } from "@/lib/api/appointment.const";
import { dayjs } from "@/lib/dayjs";
import { hasPermission, requireSession } from "@/lib/server/session";
import { isApiError } from "@/lib/api/errors";
import {
  formatDoctorFullName,
  formatPatientFullName,
} from "@/appointment/labels";

interface AppointmentDetailPageProps {
  params: Promise<{ locale: AppLocale; id: string }>;
}

/**
 * F09 appointment detail page (`/appointments/:id`).
 *
 * The BE returns `404 APPOINTMENT_NOT_FOUND` for both unknown ids AND
 * for ids the caller's scope can't see (no existence leak). The detail
 * page treats both cases the same — a generic "not found" card with a
 * back link.
 */
export default async function AppointmentDetailPage({
  params,
}: AppointmentDetailPageProps) {
  const { locale, id } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.AppointmentsDetail);
  const tErrors = await getTranslations(NS.AppointmentsErrors);
  const tType = await getTranslations(NS.CommonAppointmentType);
  const tStatus = await getTranslations(NS.CommonAppointmentStatus);

  const canRead = hasPermission(
    session,
    PERMISSION_CODE.APPOINTMENT_READ_OWN,
    PERMISSION_CODE.APPOINTMENT_READ_OWN_DEPARTMENT,
    PERMISSION_CODE.APPOINTMENT_READ_ALL,
  );

  if (!canRead) {
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
              {t(K.Appointments.Detail.notFound)}
            </Typography>
            <BackToAppointmentsButton
              label={t(K.Appointments.Detail.back)}
            />
          </Stack>
        </Card>
      );
    }

    throw err;
  }

  const canCancel =
    appointment.status === "BOOKED" &&
    hasPermission(
      session,
      PERMISSION_CODE.APPOINTMENT_DELETE_OWN,
      PERMISSION_CODE.APPOINTMENT_DELETE_OWN_DEPARTMENT,
    );

  const start = dayjs(appointment.startAt).locale(locale);
  const end = dayjs(appointment.endAt).locale(locale);

  return (
    <Stack spacing={3}>
      <BackToAppointmentsButton
        label={t(K.Appointments.Detail.back)}
        sx={{ alignSelf: "flex-start" }}
      />

      {appointment.status === "CANCELLED" ? (
        <Alert severity="warning">
          {t(K.Appointments.Detail.alreadyCancelled)}
        </Alert>
      ) : null}
      {appointment.status === "COMPLETED" ? (
        <Alert severity="info">
          {t(K.Appointments.Detail.alreadyCompleted)}
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
              </Stack>
            </Stack>

            <DetailRow
              label={t(K.Appointments.Detail.hnLabel)}
              value={appointment.patient.hn}
            />
            <DetailRow
              label={t(K.Appointments.Detail.doctorLabel)}
              value={`${formatDoctorFullName(appointment.doctor)} (${appointment.doctor.doctorCode})`}
            />
            <DetailRow
              label={t(K.Appointments.Detail.departmentLabel)}
              value={appointment.department.name}
            />
            <DetailRow
              label={t(K.Appointments.Detail.startsAt)}
              value={start.format("dddd, D MMMM YYYY HH:mm")}
            />
            <DetailRow
              label={t(K.Appointments.Detail.endsAt)}
              value={end.format("dddd, D MMMM YYYY HH:mm")}
            />
            <DetailRow
              label={t(K.Appointments.Detail.reasonLabel)}
              value={
                appointment.reason && appointment.reason.length > 0
                  ? appointment.reason
                  : t(K.Appointments.Detail.noReason)
              }
            />
            <DetailRow
              label={t(K.Appointments.Detail.createdAt)}
              value={dayjs(appointment.createdAt)
                .locale(locale)
                .format("ddd, D MMM YYYY HH:mm")}
            />
            {appointment.cancelledAt ? (
              <>
                <DetailRow
                  label={t(K.Appointments.Detail.cancelledAt)}
                  value={dayjs(appointment.cancelledAt)
                    .locale(locale)
                    .format("ddd, D MMM YYYY HH:mm")}
                />
                <DetailRow
                  label={t(K.Appointments.Detail.cancellationReason)}
                  value={
                    appointment.cancellationReason &&
                    appointment.cancellationReason.length > 0
                      ? appointment.cancellationReason
                      : t(K.Appointments.Detail.noReason)
                  }
                />
              </>
            ) : null}

            {canCancel ? (
              <AppointmentCancelButton appointmentId={appointment.id} />
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
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
