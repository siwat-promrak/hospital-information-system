import { FE_PATH } from "@/auth/routes";
import { PERMISSION_CODE } from "@/auth/permissions";
import { ROLE } from "@/auth/roles";
import { K } from "@/i18n/keys.generated";

import type { NavItem } from "./nav-items.types";

/**
 * Icon registry — keys are stable string codes, values are looked up at
 * render time in `AppSidebar`'s icon map. Kept as plain strings so this
 * module stays free of `@mui/icons-material` imports.
 */
export const NAV_ICON = {
  DASHBOARD: "dashboard",
  DEPARTMENTS: "departments",
  DOCTORS: "doctors",
  MY_SCHEDULE: "my_schedule",
} as const;

/**
 * Canonical sidebar navigation catalog. Adding a new menu item is a
 * single-edit change here — the sidebar reads this catalog rather than
 * hand-listing items in JSX.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "dashboard",
    href: FE_PATH.HOME,
    iconName: NAV_ICON.DASHBOARD,
    i18nKey: K.Nav.items.dashboard,
  },
  {
    id: "departments",
    href: FE_PATH.DEPARTMENTS,
    iconName: NAV_ICON.DEPARTMENTS,
    i18nKey: K.Nav.items.departments,
    permission: PERMISSION_CODE.DOCTOR_LIST,
  },
  {
    id: "doctors",
    href: FE_PATH.DOCTORS,
    iconName: NAV_ICON.DOCTORS,
    i18nKey: K.Nav.items.doctors,
    permission: PERMISSION_CODE.DOCTOR_LIST,
  },
  {
    id: "my-schedule",
    href: FE_PATH.DOCTOR_SCHEDULE,
    iconName: NAV_ICON.MY_SCHEDULE,
    i18nKey: K.Nav.items.mySchedule,
    permission: PERMISSION_CODE.SCHEDULE_MANAGE,
    requireRoles: [ROLE.DOCTOR],
  },
];
