import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  APPOINTMENT_READ_SCOPE,
  resolveAppointmentReadScope,
} from "@/appointment/scope";
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
import { getMe } from "@/lib/api/auth.api";
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

  const readScope = resolveAppointmentReadScope(
    session.user.permissionCodes,
  );

  if (readScope === null) {
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

  // Per-scope filter matrix for the appointments page:
  //
  //  - `ALL`           : department + doctor pickers both editable. MRO
  //                       (no seeded role today, but future F11 ADMIN
  //                       lands here).
  //  - `OWN_DEPARTMENT`: department EDITABLE + prefilled to caller's
  //                       home on first load (no URL `?departmentId=`),
  //                       doctor picker EDITABLE (NURSE / DOCTOR — DOCTOR
  //                       holds both `.own` AND `.own-department` in the
  //                       seeded baseline, so they fall into this branch
  //                       and can browse colleagues for cross-coverage).
  //                       The BE auto-narrows to the caller's dept
  //                       regardless of what the picker shows, so the
  //                       prefill is pure UX — the chip reflects the
  //                       active narrowing without making the user
  //                       guess. Clearing / changing the picker writes
  //                       to the URL; the URL is the source of truth as
  //                       soon as the user interacts.
  //  - `OWN`           : department disabled + pinned + doctor disabled
  //                       + pinned to caller's `me.doctor.id`. No seeded
  //                       role today; a custom role with only `.own`
  //                       triggers this branch.
  const callerDepartmentId = session.user.departmentId ?? undefined;
  const isReadOwnOnly = readScope === APPOINTMENT_READ_SCOPE.OWN;
  const isReadOwnDepartment =
    readScope === APPOINTMENT_READ_SCOPE.OWN_DEPARTMENT;
  // First-load prefill for `.own-department`-only callers: pre-select
  // the caller's home department in the filter when no explicit
  // `?departmentId=` is in the URL. Skipped (`undefined`) when the URL
  // already carries an explicit value, or when the session has no
  // department (shouldn't happen for NURSE post PR #11 — guard
  // defensively).
  const prefilledDepartmentId =
    isReadOwnDepartment && !departmentIdParam && callerDepartmentId
      ? callerDepartmentId
      : undefined;
  // What the filter card renders as its currently-active department —
  // the URL wins (user has interacted), the prefill fills in on first
  // load, otherwise nothing.
  const effectiveDepartmentId =
    departmentIdParam ?? prefilledDepartmentId ?? null;
  // Fetch `/me` only when we genuinely need the caller's doctor id to
  // pin the picker — saves a round-trip for the common DOCTOR / NURSE /
  // MRO cases that don't lock the doctor field.
  const me = isReadOwnOnly ? await getMe() : null;
  const forcedDoctorId = isReadOwnOnly ? me?.doctor?.id : undefined;
  // When the doctor is forced, scope the picker seed to ANY department
  // that contains the caller's row — easiest is to fetch by the doctor's
  // own department so the seed surely contains the locked row. Falls
  // back to the caller's user department / URL filter for the wider
  // cases.
  const doctorSeedDepartmentId = forcedDoctorId
    ? (me?.doctor?.departmentId ?? callerDepartmentId)
    : (callerDepartmentId ?? departmentIdParam);

  const [appointmentsResult, departmentsResult, doctorSeed] =
    await Promise.all([
      listAppointments({
        page,
        pageSize,
        doctorId: forcedDoctorId ?? doctorIdParam,
        patientId: patientIdParam,
        departmentId: departmentIdParam,
        from: fromParam,
        to: toParam,
        status,
        order,
      }),
      listDepartments({ page: DEFAULT_PAGE, pageSize: MAX_PAGE_SIZE }),
      fetchDoctorPickerSeed({
        departmentId: doctorSeedDepartmentId,
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
        // The hard scope the FE picker MUST stay inside even when the
        // user clears their locally-picked department — for NURSE /
        // DOCTOR this is their caller dept (the BE-side scope auto-
        // narrow); for `.all` callers (MRO / future ADMIN) this is
        // `undefined` so clearing the local department widens the
        // picker back to the full catalog. Do NOT fall back to the URL
        // `departmentIdParam` here: that param is the active filter
        // value, not a scope ceiling. Conflating the two was the bug —
        // the picker stayed narrowed to the URL dept even after the
        // user cleared it locally.
        doctorScopeDepartmentId={callerDepartmentId}
        activeDepartmentId={effectiveDepartmentId}
        activeDoctorId={forcedDoctorId ?? doctorIdParam ?? null}
        activeStatus={status ?? null}
        activeOrder={order}
        activeFrom={fromParam ?? ""}
        activeTo={toParam ?? ""}
        departmentFilterDisabled={isReadOwnOnly}
        forcedDoctorId={forcedDoctorId}
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
