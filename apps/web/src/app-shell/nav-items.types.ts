import type { RoleCode } from "@/auth/roles";
import type { K } from "@/i18n/keys.generated";

import type { NAV_ICON } from "./nav-items.const";

/**
 * Icon identifier looked up in the icon map at render time. Values are
 * the typed `as const` values of `NAV_ICON`.
 */
export type NavIconKey = (typeof NAV_ICON)[keyof typeof NAV_ICON];

/**
 * i18n leaf key for a navigation item (under `NS.NavItems`). Derived from
 * the generated `K` catalog so a rename of a message key fails the build.
 */
export type NavItemI18nKey = (typeof K.Nav.items)[keyof typeof K.Nav.items];

/**
 * One sidebar entry:
 *   - `id` — stable string code, used as React key and in tests.
 *   - `href` — locale-stripped FE path; the layout prepends `/${locale}`.
 *   - `iconName` — react identifier looked up in the icon map at render
 *     time (kept as a string so this module stays free of
 *     `@mui/icons-material` imports and can be consumed by server + client
 *     code).
 *   - `i18nKey` — leaf key under `NS.NavItems`.
 *   - `permission` — optional list of permission codes (from
 *     `PERMISSION_CODE`). Any-of semantics: the item is rendered when
 *     the caller holds at least one of the listed codes.
 *   - `requireRoles` — optional whitelist of role codes; if set, the item
 *     is only rendered when `session.user.roleCode` is one of them.
 */
export interface NavItem {
  id: string;
  href: string;
  iconName: NavIconKey;
  i18nKey: NavItemI18nKey;
  permission?: readonly string[];
  requireRoles?: readonly RoleCode[];
}
