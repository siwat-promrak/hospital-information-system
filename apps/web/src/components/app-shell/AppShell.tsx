"use client";

import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import { useState, type ReactNode } from "react";

import type { AppLocale } from "@/i18n/routing";

import { APP_HEADER_HEIGHT_PX } from "@/app-shell/layout.const";
import { filterNavItems } from "@/app-shell/nav-items";
import { NAV_ITEMS } from "@/app-shell/nav-items.const";

import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";

interface AppShellProps {
  locale: AppLocale;
  user: {
    name: string;
    email: string;
    picture: string | null;
    roleCode: string;
    permissionCodes: readonly string[];
  };
  children: ReactNode;
}

/**
 * Top-level chrome wrapper rendered by the protected `(app)` layout.
 * Owns the two pieces of client-side UI state — `mobileOpen` (temporary
 * drawer on xs–sm) and `desktopCollapsed` (mini-rail toggle on md+) —
 * because they outlive any single page render.
 *
 * Filters the static nav catalog to the items the signed-in user is
 * permitted to see (per-permission + per-role) before passing it down.
 */
export default function AppShell({ locale, user, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  const items = filterNavItems(NAV_ITEMS, user.roleCode, user.permissionCodes);

  const toggleMobile = () => setMobileOpen((prev) => !prev);
  const toggleDesktop = () => setDesktopCollapsed((prev) => !prev);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppHeader
        locale={locale}
        desktopCollapsed={desktopCollapsed}
        onMobileToggle={toggleMobile}
        user={{
          name: user.name,
          email: user.email,
          picture: user.picture,
        }}
      />
      <AppSidebar
        items={items}
        mobileOpen={mobileOpen}
        desktopCollapsed={desktopCollapsed}
        onMobileClose={() => setMobileOpen(false)}
        onDesktopToggle={toggleDesktop}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          bgcolor: "background.default",
          p: { xs: 2, sm: 3 },
        }}
      >
        <Toolbar sx={{ minHeight: `${APP_HEADER_HEIGHT_PX}px !important` }} />
        {children}
      </Box>
    </Box>
  );
}
