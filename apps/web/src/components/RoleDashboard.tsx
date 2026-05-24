import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import SignOutButton from "@/components/SignOutButton";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";

interface RoleDashboardProps {
  locale: AppLocale;
  name: string;
  roleCode: string;
  permissionCodes: readonly string[];
  comingSoonMessage: string;
}

/**
 * Shared dashboard placeholder rendered by the role-specific routes
 * (/admin, /staff, /me/schedule) until F06 / F08 / F11 land. Surfaces the
 * authenticated user's name, role, and the resolved permission codes,
 * plus a sign-out button.
 *
 * The "coming soon" copy is passed in already-translated rather than
 * indexed via a key here — each placeholder owns its own message and
 * RoleDashboard stays decoupled from the K catalog beyond its own labels.
 */
export default async function RoleDashboard({
  locale,
  name,
  roleCode,
  permissionCodes,
  comingSoonMessage,
}: RoleDashboardProps) {
  const t = await getTranslations(NS.Dashboard);

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        p: 4,
      }}
    >
      <Container maxWidth="md">
        <Paper elevation={2} sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "center" }}
            >
              <Typography variant="h4" component="h1" color="primary">
                {t(K.Dashboard.welcome, { name })}
              </Typography>
              <SignOutButton callbackUrl={`/${locale}${FE_PATH.SIGNIN}`} />
            </Stack>

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
      </Container>
    </Box>
  );
}
