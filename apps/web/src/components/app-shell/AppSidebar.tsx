"use client";

import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import DashboardIcon from "@mui/icons-material/Dashboard";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import PeopleIcon from "@mui/icons-material/People";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { Link, usePathname } from "@/i18n/navigation";

import {
  APP_HEADER_HEIGHT_PX,
  SIDEBAR_WIDTH_COLLAPSED_PX,
  SIDEBAR_WIDTH_EXPANDED_PX,
} from "@/app-shell/layout.const";
import { NAV_ICON } from "@/app-shell/nav-items.const";
import type { NavIconKey, NavItem } from "@/app-shell/nav-items.types";

interface AppSidebarProps {
  items: readonly NavItem[];
  mobileOpen: boolean;
  desktopCollapsed: boolean;
  onMobileClose: () => void;
}

/**
 * Responsive sidebar. Renders two Drawers (MUI pattern):
 *   - `temporary` for `xs–sm` (slides over content, toggled by hamburger).
 *   - `permanent` for `md+` (always visible; width toggles between
 *     expanded + collapsed mini-rail via `desktopCollapsed`).
 *
 * The HIS brand sits in a `Toolbar`-sized header matching the AppBar so
 * the persistent drawer aligns visually with the header bar.
 */
export default function AppSidebar({
  items,
  mobileOpen,
  desktopCollapsed,
  onMobileClose,
}: AppSidebarProps) {
  const sharedDrawer = (collapsed: boolean) => (
    <SidebarContents items={items} collapsed={collapsed} />
  );

  const drawerWidth = desktopCollapsed
    ? SIDEBAR_WIDTH_COLLAPSED_PX
    : SIDEBAR_WIDTH_EXPANDED_PX;

  return (
    <Box
      component="nav"
      aria-label="Main navigation"
      sx={{
        width: { md: drawerWidth },
        flexShrink: { md: 0 },
      }}
    >
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: SIDEBAR_WIDTH_EXPANDED_PX,
          },
        }}
      >
        {sharedDrawer(false)}
      </Drawer>
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: drawerWidth,
            overflowX: "hidden",
            transition: (theme) =>
              theme.transitions.create("width", {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.standard,
              }),
          },
        }}
      >
        {sharedDrawer(desktopCollapsed)}
      </Drawer>
    </Box>
  );
}

interface SidebarContentsProps {
  items: readonly NavItem[];
  collapsed: boolean;
}

function SidebarContents({ items, collapsed }: SidebarContentsProps) {
  const tNav = useTranslations(NS.Nav);
  const tNavItems = useTranslations(NS.NavItems);
  const pathname = usePathname();

  return (
    <>
      <Toolbar
        disableGutters
        sx={{
          minHeight: `${APP_HEADER_HEIGHT_PX}px !important`,
          px: collapsed ? 0 : 2,
          justifyContent: collapsed ? "center" : "flex-start",
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden
          >
            <LocalHospitalIcon fontSize="small" />
          </Box>
          {!collapsed ? (
            <Typography
              variant="subtitle1"
              fontWeight={700}
              color="primary.main"
              sx={{ letterSpacing: 1 }}
            >
              {tNav(K.Nav.brand)}
            </Typography>
          ) : null}
        </Stack>
      </Toolbar>
      <List sx={{ py: 1 }}>
        {items.map((item) => {
          const Icon = ICON_FOR[item.iconName];
          const label = tNavItems(item.i18nKey);
          const selected = isItemSelected(pathname, item.href);

          const button = (
            <ListItemButton
              component={Link}
              href={item.href}
              selected={selected}
              sx={{
                mx: collapsed ? 0.5 : 1,
                borderRadius: 1.5,
                justifyContent: collapsed ? "center" : "flex-start",
                px: collapsed ? 1 : 2,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: collapsed ? 0 : 2,
                  justifyContent: "center",
                  color: selected ? "primary.main" : "text.secondary",
                }}
              >
                <Icon fontSize="small" />
              </ListItemIcon>
              {!collapsed ? (
                <ListItemText
                  primary={label}
                  slotProps={{
                    primary: {
                      variant: "body2",
                      fontWeight: selected ? 600 : 500,
                    },
                  }}
                />
              ) : null}
            </ListItemButton>
          );

          if (collapsed) {
            return (
              <Tooltip
                key={item.id}
                title={label}
                placement="right"
                arrow
              >
                <Box>{button}</Box>
              </Tooltip>
            );
          }

          return <Box key={item.id}>{button}</Box>;
        })}
      </List>
    </>
  );
}

function isItemSelected(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

const ICON_FOR: Readonly<
  Record<NavIconKey, ComponentType<{ fontSize?: "small" | "medium" | "large" }>>
> = {
  [NAV_ICON.DASHBOARD]: DashboardIcon,
  [NAV_ICON.DEPARTMENTS]: LocalHospitalIcon,
  [NAV_ICON.DOCTORS]: PeopleIcon,
  [NAV_ICON.MY_SCHEDULE]: CalendarMonthIcon,
};

