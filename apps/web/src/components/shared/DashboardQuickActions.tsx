import AddBoxIcon from "@mui/icons-material/AddBox";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ComponentType, ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import { PERMISSION_CODE } from "@/auth/permissions";
import { K, NS } from "@/i18n/keys.generated";
import { Link } from "@/i18n/navigation";

interface DashboardQuickActionsProps {
  permissionCodes: readonly string[];
}

interface QuickAction {
  id: string;
  href: string;
  title: string;
  description: string;
  action: string;
  Icon: ComponentType<{ fontSize?: "small" | "medium" | "large" }>;
}

/**
 * Permission-aware quick-action cards rendered above the role dashboard
 * placeholder copy on `/nurse`, `/medical-records-officer`, and other
 * role-specific landing pages. Each card mirrors a sidebar nav item but
 * shows up as a CTA so the user lands on something actionable after
 * sign-in.
 *
 * Cards are filtered by the caller's permission codes — same any-of
 * semantics as the sidebar — so a role without `appointment.read.*`
 * won't see the appointments card. Renders nothing when the caller
 * holds none of the gated permissions.
 */
export default async function DashboardQuickActions({
  permissionCodes,
}: DashboardQuickActionsProps) {
  const tDashboard = await getTranslations(NS.Dashboard);
  const tAppointmentsCard = await getTranslations(
    NS.DashboardAppointmentsCard,
  );
  const tBookCard = await getTranslations(NS.DashboardBookCard);
  const tPatientsCard = await getTranslations(NS.DashboardPatientsCard);

  const held = new Set(permissionCodes);

  const allActions: ReadonlyArray<
    QuickAction & { permissionGate: readonly string[] }
  > = [
    {
      id: "appointments",
      href: FE_PATH.APPOINTMENTS,
      title: tAppointmentsCard(K.Dashboard.appointmentsCard.title),
      description: tAppointmentsCard(
        K.Dashboard.appointmentsCard.description,
      ),
      action: tAppointmentsCard(K.Dashboard.appointmentsCard.action),
      Icon: CalendarMonthIcon,
      permissionGate: [
        PERMISSION_CODE.APPOINTMENT_READ_OWN,
        PERMISSION_CODE.APPOINTMENT_READ_OWN_DEPARTMENT,
        PERMISSION_CODE.APPOINTMENT_READ_ALL,
      ],
    },
    {
      id: "appointments-new",
      href: FE_PATH.APPOINTMENTS_NEW,
      title: tBookCard(K.Dashboard.bookCard.title),
      description: tBookCard(K.Dashboard.bookCard.description),
      action: tBookCard(K.Dashboard.bookCard.action),
      Icon: AddBoxIcon,
      permissionGate: [
        PERMISSION_CODE.APPOINTMENT_CREATE_OWN,
        PERMISSION_CODE.APPOINTMENT_CREATE_OWN_DEPARTMENT,
      ],
    },
    {
      id: "patients-new",
      href: FE_PATH.PATIENTS_NEW,
      title: tPatientsCard(K.Dashboard.patientsCard.title),
      description: tPatientsCard(K.Dashboard.patientsCard.description),
      action: tPatientsCard(K.Dashboard.patientsCard.action),
      Icon: PersonAddIcon,
      permissionGate: [PERMISSION_CODE.PATIENT_CREATE],
    },
  ];

  const actions = allActions.filter((a) =>
    a.permissionGate.some((code) => held.has(code)),
  );

  if (actions.length === 0) {
    return null;
  }

  // Reference `tDashboard` so the i18n namespace stays imported and
  // future copy additions (section heading, empty state) don't drift.
  void tDashboard;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(2, minmax(0, 1fr))",
          md: "repeat(3, minmax(0, 1fr))",
        },
        gap: 2,
      }}
    >
      {actions.map((a) => (
        <ActionCard key={a.id} action={a} />
      ))}
    </Box>
  );
}

interface ActionCardProps {
  action: QuickAction;
}

function ActionCard({ action }: ActionCardProps): ReactNode {
  const { href, title, description, action: actionLabel, Icon } = action;

  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{ mb: 1 }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1,
              bgcolor: "primary.50",
              color: "primary.main",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden
          >
            <Icon fontSize="small" />
          </Box>
          <Typography variant="subtitle1" fontWeight={600}>
            {title}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </CardContent>
      <CardActions sx={{ justifyContent: "flex-end" }}>
        <Button component={Link} href={href} size="small" color="primary">
          {actionLabel}
        </Button>
      </CardActions>
    </Card>
  );
}
