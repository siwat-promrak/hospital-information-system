"use client";

import MenuIcon from "@mui/icons-material/Menu";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import { useTranslations } from "next-intl";

import LocaleSwitcher from "@/app/[locale]/LocaleSwitcher";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";

import {
  APP_HEADER_HEIGHT_PX,
  SIDEBAR_WIDTH_COLLAPSED_PX,
  SIDEBAR_WIDTH_EXPANDED_PX,
} from "@/app-shell/layout.const";

import Breadcrumb from "./Breadcrumb";
import UserMenu from "./UserMenu";

interface AppHeaderProps {
  locale: AppLocale;
  desktopCollapsed: boolean;
  onMobileToggle: () => void;
  user: {
    name: string;
    email: string;
    picture: string | null;
  };
  breadcrumbLabelOverrides?: Readonly<Record<number, string>>;
}

/**
 * Top app bar. Lays out (left → right):
 *   - hamburger (xs–sm) to toggle the temporary drawer
 *   - URL-derived breadcrumb
 *   - locale switcher
 *   - avatar + dropdown menu (sign out)
 *
 * The desktop collapse/expand chevron lives at the bottom of the sidebar
 * itself (see `AppSidebar`), not here — keeps the toggle visually anchored
 * to what it controls.
 *
 * The AppBar shifts/widens to leave space for the persistent drawer on
 * md+; on smaller screens it spans the full width and the drawer slides
 * over the content.
 */
export default function AppHeader({
  locale,
  desktopCollapsed,
  onMobileToggle,
  user,
  breadcrumbLabelOverrides,
}: AppHeaderProps) {
  const tNav = useTranslations(NS.Nav);

  const desktopWidth = desktopCollapsed
    ? SIDEBAR_WIDTH_COLLAPSED_PX
    : SIDEBAR_WIDTH_EXPANDED_PX;

  return (
    <AppBar
      position="fixed"
      color="inherit"
      sx={{
        width: { md: `calc(100% - ${desktopWidth}px)` },
        ml: { md: `${desktopWidth}px` },
        bgcolor: "background.paper",
        color: "text.primary",
        transition: (theme) =>
          theme.transitions.create(["margin", "width"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.standard,
          }),
      }}
    >
      <Toolbar
        sx={{
          minHeight: `${APP_HEADER_HEIGHT_PX}px !important`,
          gap: { xs: 1, sm: 2 },
        }}
      >
        <Tooltip title={tNav(K.Nav.openMenu)}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={onMobileToggle}
            aria-label={tNav(K.Nav.openMenu)}
            sx={{ display: { xs: "inline-flex", md: "none" } }}
          >
            <MenuIcon />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Breadcrumb labelOverrides={breadcrumbLabelOverrides} />
        </Box>
        <Stack
          direction="row"
          spacing={{ xs: 1, sm: 1.5 }}
          alignItems="center"
          sx={{ flexShrink: 0 }}
        >
          <Box sx={{ display: { xs: "none", sm: "inline-flex" } }}>
            <LocaleSwitcher />
          </Box>
          <UserMenu
            locale={locale}
            name={user.name}
            email={user.email}
            picture={user.picture}
          />
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
