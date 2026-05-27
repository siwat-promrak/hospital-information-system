"use client";

import AddBoxIcon from "@mui/icons-material/AddBox";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DashboardIcon from "@mui/icons-material/Dashboard";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import EventNoteIcon from "@mui/icons-material/EventNote";
import FolderSharedIcon from "@mui/icons-material/FolderShared";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";
import PeopleIcon from "@mui/icons-material/People";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import RecentActorsIcon from "@mui/icons-material/RecentActors";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
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
  onDesktopToggle: () => void;
}

/**
 * Responsive sidebar. Renders two Drawers (MUI pattern):
 *   - `temporary` for `xs–sm` (slides over content, toggled by hamburger).
 *   - `permanent` for `md+` (always visible; width toggles between
 *     expanded + collapsed mini-rail via `desktopCollapsed`).
 *
 * The HIS brand sits in a `Toolbar`-sized header matching the AppBar so
 * the persistent drawer aligns visually with the header bar. The
 * collapse/expand chevron sits in a sibling footer at the bottom — only
 * rendered inside the permanent drawer because the temporary mobile
 * drawer has no "collapsed" form.
 */
export default function AppSidebar({
  items,
  mobileOpen,
  desktopCollapsed,
  onMobileClose,
  onDesktopToggle,
}: AppSidebarProps) {
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
        <SidebarContents items={items} collapsed={false} />
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
        <SidebarContents
          items={items}
          collapsed={desktopCollapsed}
          collapseToggle={{
            collapsed: desktopCollapsed,
            onToggle: onDesktopToggle,
          }}
        />
      </Drawer>
    </Box>
  );
}

interface SidebarContentsProps {
  items: readonly NavItem[];
  collapsed: boolean;
  /**
   * When set, renders a footer at the bottom of the drawer with a
   * chevron that toggles the mini-rail mode. Only the permanent drawer
   * passes this — the temporary mobile drawer has no "collapsed" form.
   */
  collapseToggle?: {
    collapsed: boolean;
    onToggle: () => void;
  };
}

function SidebarContents({
  items,
  collapsed,
  collapseToggle,
}: SidebarContentsProps) {
  const tNav = useTranslations(NS.Nav);
  const tNavItems = useTranslations(NS.NavItems);
  const pathname = usePathname();

  // Single-pass active-item resolution. When two entries share a prefix
  // (e.g. `/appointments` + `/appointments/new`) the most-specific match
  // wins, so visiting `/appointments/new` highlights only "Book
  // appointment" — not both menu items. Hoisted out of the per-item
  // render so the longest-prefix comparison runs once per nav cycle.
  const activeItemId = resolveActiveItemId(items, pathname);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
      <List sx={{ py: 1, flexGrow: 1, overflowY: "auto" }}>
        {items.map((item) => {
          const Icon = ICON_FOR[item.iconName];
          const label = tNavItems(item.i18nKey);
          const selected = item.id === activeItemId;

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
      {collapseToggle ? (
        <>
          <Divider />
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              p: 1,
            }}
          >
            <Tooltip
              title={
                collapseToggle.collapsed
                  ? tNav(K.Nav.expand)
                  : tNav(K.Nav.collapse)
              }
              placement="right"
            >
              <IconButton
                onClick={collapseToggle.onToggle}
                aria-label={
                  collapseToggle.collapsed
                    ? tNav(K.Nav.expand)
                    : tNav(K.Nav.collapse)
                }
                size="small"
              >
                {collapseToggle.collapsed ? (
                  <ChevronRightIcon />
                ) : (
                  <ChevronLeftIcon />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </>
      ) : null}
    </Box>
  );
}

/**
 * Resolve which nav item is "currently active" given the URL. Walks the
 * nav array once and picks the entry whose `href` is the longest prefix
 * of `pathname` (with the same equality / `startsWith(href + "/")`
 * semantics the per-item check used). The longest-prefix rule makes
 * sibling routes like `/appointments` + `/appointments/new` mutually
 * exclusive — visiting `/appointments/new` activates only the more
 * specific entry, even though `/appointments` is also a prefix match.
 *
 * Returns the item's `id` (or `null` when no entry matches) so the per-
 * item render can light up exactly one `<ListItemButton>` per pathname.
 */
function resolveActiveItemId(
  items: readonly NavItem[],
  pathname: string,
): string | null {
  let bestId: string | null = null;
  let bestLength = -1;

  for (const item of items) {
    if (!isHrefMatch(item.href, pathname)) {
      continue;
    }

    if (item.href.length > bestLength) {
      bestId = item.id;
      bestLength = item.href.length;
    }
  }

  return bestId;
}

function isHrefMatch(href: string, pathname: string): boolean {
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
  [NAV_ICON.SCHEDULES]: EventNoteIcon,
  [NAV_ICON.MEDICAL_RECORDS]: FolderSharedIcon,
  [NAV_ICON.APPOINTMENTS]: CalendarMonthIcon,
  [NAV_ICON.APPOINTMENTS_NEW]: AddBoxIcon,
  [NAV_ICON.PATIENTS]: RecentActorsIcon,
  [NAV_ICON.PATIENTS_NEW]: PersonAddIcon,
  [NAV_ICON.APPOINTMENT_GROUPS]: AccountTreeIcon,
  [NAV_ICON.REFERRALS]: CallSplitIcon,
  [NAV_ICON.FIND_SLOT]: EventAvailableIcon,
  // F18 — doctor workspace queue.
  [NAV_ICON.WORKSPACE]: MedicalServicesIcon,
};

