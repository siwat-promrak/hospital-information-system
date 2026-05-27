/**
 * FE-side mirror of the canonical RBAC role catalog (see
 * `apps/api/src/auth/roles.ts` for the source of truth). Future custom
 * roles created at runtime (US-11.6) are NOT in this catalog by definition.
 *
 * Keep this file aligned with the BE catalog — drift means a sign-in flow
 * that succeeds on the API but isn't routable on the FE.
 */

export const ROLE = {
  ADMIN: "ADMIN",
  DOCTOR: "DOCTOR",
  NURSE: "NURSE",
  MEDICAL_RECORDS_OFFICER: "MEDICAL_RECORDS_OFFICER",
  PHARMACY: "PHARMACY",
} as const;

export type RoleCode = (typeof ROLE)[keyof typeof ROLE];
