import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { K, NS } from "@/i18n/keys.generated";

interface RoleDashboardProps {
  name: string;
  roleCode: string;
  permissionCodes: readonly string[];
  comingSoonMessage: string;
}

/**
 * Shared dashboard placeholder rendered by the role-specific routes
 * (/admin, /nurse, /medical-records-officer, /pharmacy) until F08 / F11
 * land. DOCTOR no longer routes to a role-specific dashboard — the
 * unified `/schedules` page is their default surface. Surfaces the
 * authenticated user's name, role, and the resolved permission codes.
 *
 * Sign-out lives in the AppShell user menu now, so this body no longer
 * carries its own button. Same for layout chrome — the shell already
 * places the main content area, so this component renders a single Paper
 * card that flows in the parent layout.
 */
export default async function RoleDashboard({
  name,
  roleCode,
  permissionCodes,
  comingSoonMessage,
}: RoleDashboardProps) {
  const t = await getTranslations(NS.Dashboard);

  return (
    <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 } }}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1" color="primary">
          {t(K.Dashboard.welcome, { name })}
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2" color="text.secondary">
            {t(K.Dashboard.roleLabel)}:
          </Typography>
          <Chip label={roleCode} color="primary" variant="outlined" />
        </Stack>

        <Stack spacing={1}>
          <Typography variant="subtitle2" color="text.secondary">
            {t(K.Dashboard.permissionsLabel)}
          </Typography>
          {permissionCodes.length > 0 ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {permissionCodes.map((code) => (
                <Chip key={code} label={code} size="small" />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {t(K.Dashboard.noPermissions)}
            </Typography>
          )}
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {comingSoonMessage}
        </Typography>
      </Stack>
    </Paper>
  );
}
