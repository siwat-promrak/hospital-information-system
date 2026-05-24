/**
 * FE-side mirror of the canonical RBAC role catalog (see
 * `apps/api/src/auth/roles.ts` for the source of truth). Future custom
 * roles created at runtime (US-11.6) are NOT in this catalog by definition.
 *
 * Keep this file aligned with the BE catalog — drift means a sign-in flow
 * that succeeds on the API but isn't routable on the FE.
 */

import { FE_PATH } from "./routes";

export const ROLE = {
  ADMIN: "ADMIN",
  STAFF: "STAFF",
  DOCTOR: "DOCTOR",
} as const;

export type RoleCode = (typeof ROLE)[keyof typeof ROLE];

/**
 * Post-sign-in destination per role. Used by the role dispatcher at
 * `/[locale]/page.tsx`. Future PRs (F05/F06/F08/F11) replace the
 * placeholder routes with their real implementations — but the path
 * mappings stay the same.
 */
export const DASHBOARD_PATH: Readonly<Record<RoleCode, string>> = {
  [ROLE.ADMIN]: FE_PATH.ADMIN,
  [ROLE.STAFF]: FE_PATH.STAFF,
  [ROLE.DOCTOR]: FE_PATH.DOCTOR_SCHEDULE,
};
