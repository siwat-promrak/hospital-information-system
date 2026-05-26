import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import { PERMISSION_CODE } from "@/auth/permissions";
import AppointmentListFilter from "@/components/appointment/AppointmentListFilter";
import AppointmentListRow from "@/components/appointment/AppointmentListRow";
import AppointmentsNewButton from "@/components/appointment/AppointmentsNewButton";
import PaginationControl from "@/components/shared/PaginationControl";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { listAppointments } from "@/lib/api/appointment.api";
import {
  APPOINTMENT_LIST_ORDER,
  APPOINTMENT_QUERY_PARAM,
  APPOINTMENT_STATUS,
  type AppointmentListOrderValue,
  type AppointmentStatusValue,
} from "@/lib/api/appointment.const";
import { listDepartments } from "@/lib/api/department.api";
import { fetchDoctorPickerSeed } from "@/lib/api/doctor.actions";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/lib/api/pagination.const";
import { parsePositiveInt } from "@/lib/utils/parse";
import { hasPermission, requireSession } from "@/lib/server/session";

interface AppointmentsPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{
    page?: string;
    doctorId?: string;
    patientId?: string;
    departmentId?: string;
    from?: string;
    to?: string;
    status?: string;
    order?: string;
  }>;
}

function resolveStatus(
  raw: string | undefined,
): AppointmentStatusValue | undefined {
  if (
    raw === APPOINTMENT_STATUS.BOOKED ||
    raw === APPOINTMENT_STATUS.CANCELLED ||
    raw === APPOINTMENT_STATUS.COMPLETED
  ) {
    return raw;
  }

  return undefined;
}

function resolveOrder(
  raw: string | undefined,
): AppointmentListOrderValue | undefined {
  if (
    raw === APPOINTMENT_LIST_ORDER.ASC ||
    raw === APPOINTMENT_LIST_ORDER.DESC
  ) {
    return raw;
  }

  return undefined;
}

/**
 * F09 appointments list. Renders a paginated list with filters on
 * department / doctor / status / date range. BE scope rules narrow
 * implicitly for DOCTOR / NURSE callers — the page only forwards
 * filters the user explicitly picked.
 *
 * Auth: `appointment.read.*` (any of). Other callers see the shared
 * forbidden card.
 */
export default async function AppointmentsPage({
  params,
  searchParams,
}: AppointmentsPageProps) {
  const { locale } = await params;
  const {
    page: pageParam,
    doctorId: doctorIdParam,
    patientId: patientIdParam,
    departmentId: departmentIdParam,
    from: fromParam,
    to: toParam,
    status: statusParam,
    order: orderParam,
  } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.Appointments);
  const tErrors = await getTranslations(NS.AppointmentsErrors);
  const tList = await getTranslations(NS.AppointmentsList);

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

  const canBook = hasPermission(
    session,
    PERMISSION_CODE.APPOINTMENT_CREATE_OWN,
    PERMISSION_CODE.APPOINTMENT_CREATE_OWN_DEPARTMENT,
  );

  const page = parsePositiveInt(pageParam) ?? DEFAULT_PAGE;
  const pageSize = DEFAULT_PAGE_SIZE;
  const status = resolveStatus(statusParam);
  const order = resolveOrder(orderParam) ?? APPOINTMENT_LIST_ORDER.ASC;

  // Scope the doctor picker to the caller's department for NURSE — the
  // BE-side scope guard would 403 a `?doctorId=<other-dept>` filter
  // anyway, but trimming the picker keeps the UX clean.
  const callerDepartmentId = session.user.departmentId ?? undefined;

  const [appointmentsResult, departmentsResult, doctorSeed] =
    await Promise.all([
      listAppointments({
        page,
        pageSize,
        doctorId: doctorIdParam,
        patientId: patientIdParam,
        departmentId: departmentIdParam,
        from: fromParam,
        to: toParam,
        status,
        order,
      }),
      listDepartments({ page: DEFAULT_PAGE, pageSize: MAX_PAGE_SIZE }),
      fetchDoctorPickerSeed({
        departmentId: callerDepartmentId ?? departmentIdParam,
      }),
    ]);

  // Preserved across pagination — every active filter ride along so the
  // user can step through the result set without losing their narrowing.
  const preservedQuery: Record<string, string | undefined> = {
    [APPOINTMENT_QUERY_PARAM.DOCTOR_ID]: doctorIdParam,
    [APPOINTMENT_QUERY_PARAM.PATIENT_ID]: patientIdParam,
    [APPOINTMENT_QUERY_PARAM.DEPARTMENT_ID]: departmentIdParam,
    [APPOINTMENT_QUERY_PARAM.FROM]: fromParam,
    [APPOINTMENT_QUERY_PARAM.TO]: toParam,
    [APPOINTMENT_QUERY_PARAM.STATUS]: status,
    [APPOINTMENT_QUERY_PARAM.ORDER]: order,
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 2, md: 3 }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
      >
        <Box>
          <Typography variant="h4" component="h1" color="primary">
            {t(K.Appointments.title)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(K.Appointments.subtitle)}
          </Typography>
        </Box>
        {canBook ? (
          <AppointmentsNewButton
            label={t(K.Appointments.newAppointment)}
          />
        ) : null}
      </Stack>

      <AppointmentListFilter
        departments={departmentsResult.data}
        doctorSeed={doctorSeed}
        doctorScopeDepartmentId={
          callerDepartmentId ?? departmentIdParam ?? undefined
        }
        activeDepartmentId={departmentIdParam ?? null}
        activeDoctorId={doctorIdParam ?? null}
        activeStatus={status ?? null}
        activeOrder={order}
        activeFrom={fromParam ?? ""}
        activeTo={toParam ?? ""}
        departmentFilterDisabled={Boolean(callerDepartmentId)}
      />

      <Card variant="outlined">
        {appointmentsResult.data.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {t(K.Appointments.empty)}
            </Typography>
          </Box>
        ) : (
          <List sx={{ py: 0 }}>
            {appointmentsResult.data.map((appointment, index) => (
              <Box key={appointment.id}>
                {index > 0 ? <Divider component="li" /> : null}
                <AppointmentListRow
                  appointment={appointment}
                  viewDetailLabel={tList(K.Appointments.List.viewDetail)}
                  locale={locale}
                />
              </Box>
            ))}
          </List>
        )}
      </Card>

      <PaginationControl
        page={appointmentsResult.page}
        totalPages={appointmentsResult.totalPages}
        basePath={FE_PATH.APPOINTMENTS}
        preservedQuery={preservedQuery}
      />
    </Stack>
  );
}
