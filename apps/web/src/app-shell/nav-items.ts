import type { RoleCode } from "@/auth/roles";

import type { NavItem } from "./nav-items.types";

/**
 * Filter the nav catalog to the items a given session may see.
 *
 * - Items without `permission` and without `requireRoles` are always
 *   shown.
 * - Items with `permission` (a list of codes) are shown when the caller
 *   holds AT LEAST ONE of the listed codes — any-of semantics, mirroring
 *   the BE's `@RequirePermission()` decorator.
 * - Items with `requireRoles` are shown only when the caller's role is
 *   in the whitelist (in addition to the permission check, if any).
 */
export function filterNavItems(
  items: readonly NavItem[],
  roleCode: string,
  permissionCodes: readonly string[],
): NavItem[] {
  return items.filter((item) => {
    if (item.requireRoles && !item.requireRoles.includes(roleCode as RoleCode)) {
      return false;
    }

    if (item.permission && item.permission.length > 0) {
      const holdsAny = item.permission.some((code) =>
        permissionCodes.includes(code),
      );

      if (!holdsAny) {
        return false;
      }
    }

    return true;
  });
}
