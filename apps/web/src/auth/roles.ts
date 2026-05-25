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
  DOCTOR: "DOCTOR",
  NURSE: "NURSE",
  MEDICAL_RECORDS_OFFICER: "MEDICAL_RECORDS_OFFICER",
  PHARMACY: "PHARMACY",
} as const;

export type RoleCode = (typeof ROLE)[keyof typeof ROLE];

/**
 * Post-sign-in destination per role. Used by the role dispatcher at
 * `/[locale]/page.tsx`.
 *
 *   ADMIN                   → `/admin`
 *   DOCTOR                  → `/schedules` (unified permission-aware page)
 *   NURSE                   → `/nurse`
 *   MEDICAL_RECORDS_OFFICER → `/medical-records-officer`
 *   PHARMACY                → `/pharmacy`
 *
 * Custom roles created at runtime (US-11.6) fall through to a sensible
 * default in the dispatcher.
 */
export const DASHBOARD_PATH: Readonly<Record<RoleCode, string>> = {
  [ROLE.ADMIN]: FE_PATH.ADMIN,
  [ROLE.DOCTOR]: FE_PATH.SCHEDULES,
  [ROLE.NURSE]: FE_PATH.NURSE,
  [ROLE.MEDICAL_RECORDS_OFFICER]: FE_PATH.MEDICAL_RECORDS_OFFICER,
  [ROLE.PHARMACY]: FE_PATH.PHARMACY,
};
