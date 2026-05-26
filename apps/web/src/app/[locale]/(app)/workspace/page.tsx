import type { Metadata } from "next";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PERMISSION_CODE } from "@/auth/permissions";
import { FE_PATH, FE_PATH_BUILDER } from "@/auth/routes";
import PaginationControl from "@/components/shared/PaginationControl";
import { K, NS } from "@/i18n/keys.generated";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { listAppointments } from "@/lib/api/appointment.api";
import {
  APPOINTMENT_LIST_ORDER,
  APPOINTMENT_STATUS,
} from "@/lib/api/appointment.const";
import { getMe } from "@/lib/api/auth.api";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "@/lib/api/pagination.const";
import { dayjs } from "@/lib/dayjs";
import { hasPermission, requireSession } from "@/lib/server/session";
import { parsePositiveInt } from "@/lib/utils/parse";
import { formatPatientFullName } from "@/appointment/labels";

interface WorkspacePageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: NS.Workspace });

  return {
    title: t(K.Workspace.title),
  };
}

/**
 * F17 — doctor workspace page (`/workspace`).
 *
 * Server component that fetches the caller's upcoming BOOKED appointments
 * (today + future) via the existing `listAppointments` endpoint with
 * `{ doctorId, status: BOOKED, from: today, order: asc }`. Gated on
 * `doctor_workspace.read.own`; renders a forbidden card for callers who
 * lack that permission.
 *
 * Each row links to `/appointments/:id` via the "Start visit" button.
 * Pagination uses `<PaginationControl>` (hidden when `totalPages <= 1`).
 */
export default async function WorkspacePage({
  params,
  searchParams,
}: WorkspacePageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.Workspace);
  const tType = await getTranslations(NS.CommonAppointmentType);

  const canAccess = hasPermission(
    session,
    PERMISSION_CODE.DOCTOR_WORKSPACE_READ_OWN,
  );

  if (!canAccess) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {t(K.Workspace.empty)}
        </Typography>
      </Card>
    );
  }

  const me = await getMe();
  const doctorId = me.doctor?.id;

  if (!doctorId) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {t(K.Workspace.empty)}
        </Typography>
      </Card>
    );
  }

  const page = parsePositiveInt(pageParam) ?? DEFAULT_PAGE;
  const today = dayjs.utc().format("YYYY-MM-DD");

  const result = await listAppointments({
    doctorId,
    status: APPOINTMENT_STATUS.BOOKED,
    from: today,
    order: APPOINTMENT_LIST_ORDER.ASC,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1">
          {t(K.Workspace.title)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t(K.Workspace.subtitle)}
        </Typography>
      </Stack>

      {result.data.length === 0 ? (
        <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t(K.Workspace.empty)}
          </Typography>
        </Card>
      ) : (
        <Card variant="outlined">
          <List disablePadding>
            {result.data.map((appointment) => {
              const start = dayjs(appointment.startAt).locale(locale);

              return (
                <ListItem
                  key={appointment.id}
                  divider
                  secondaryAction={
                    <Link
                      href={FE_PATH_BUILDER.appointmentDetail(appointment.id)}
                    >
                      {t(K.Workspace.startVisit)}
                    </Link>
                  }
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" fontWeight={600}>
                          {start.format("LL HH:mm")}
                        </Typography>
                        <Chip
                          label={tType(appointment.appointmentType)}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>
                    }
                    secondary={
                      <Stack
                        component="span"
                        direction={{ xs: "column", sm: "row" }}
                        spacing={{ xs: 0, sm: 1 }}
                      >
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                        >
                          {formatPatientFullName(appointment.patient)}
                        </Typography>
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                        >
                          {appointment.patient.hn}
                        </Typography>
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                        >
                          {appointment.department.name}
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </Card>
      )}

      <PaginationControl
        page={result.page}
        totalPages={result.totalPages}
        basePath={FE_PATH.WORKSPACE}
      />
    </Stack>
  );
}
