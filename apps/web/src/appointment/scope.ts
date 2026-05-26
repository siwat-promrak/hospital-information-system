/**
 * FE mirror of `apps/api/src/auth/scope.ts`'s `resolveAppointmentReadScope`
 * — narrows the caller's `permissionCodes` into the widest appointment-READ
 * scope they hold. Used by `/appointments` to decide whether the department
 * + doctor filters are user-editable or forced to the caller's row.
 *
 * Precedence matches the BE: `.all` > `.own-department` > `.own`. Returns
 * `null` when the caller holds no appointment-READ permission at all (the
 * page short-circuits to the forbidden card in that case).
 *
 * The corresponding BE branch lives in `resolveAppointmentReadScope`
 * (`apps/api/src/auth/scope.ts`); keep the two in lockstep — a drift would
 * leave the FE filter UI out of sync with the BE narrowing.
 */

import { PERMISSION_CODE } from "@/auth/permissions";

export const APPOINTMENT_READ_SCOPE = {
  ALL: "all",
  OWN_DEPARTMENT: "own-department",
  OWN: "own",
} as const;

export type AppointmentReadScope =
  (typeof APPOINTMENT_READ_SCOPE)[keyof typeof APPOINTMENT_READ_SCOPE];

/**
 * Resolve the effective appointment-READ scope the caller holds.
 *
 * The matrix on `/appointments` consumes the result:
 *
 *  - `ALL`           → department + doctor pickers are both editable.
 *                       MRO callers. Today no seeded role lands here for
 *                       `appointment.read.*` (MRO holds `.all` in the
 *                       baseline once F11 ships).
 *  - `OWN_DEPARTMENT` → department disabled + pinned, doctor picker stays
 *                       editable (the user can browse any colleague in
 *                       their own dept). Seeded NURSE matches this case.
 *  - `OWN`           → department disabled + pinned, doctor picker
 *                       disabled + pinned to `me.doctor.id`. No seeded
 *                       role today (DOCTOR holds both `.own` AND
 *                       `.own-department` for cross-coverage), but a
 *                       custom role with only `.own` lands here.
 */
export function resolveAppointmentReadScope(
  permissionCodes: readonly string[],
): AppointmentReadScope | null {
  if (permissionCodes.includes(PERMISSION_CODE.APPOINTMENT_READ_ALL)) {
    return APPOINTMENT_READ_SCOPE.ALL;
  }

  if (
    permissionCodes.includes(PERMISSION_CODE.APPOINTMENT_READ_OWN_DEPARTMENT)
  ) {
    return APPOINTMENT_READ_SCOPE.OWN_DEPARTMENT;
  }

  if (permissionCodes.includes(PERMISSION_CODE.APPOINTMENT_READ_OWN)) {
    return APPOINTMENT_READ_SCOPE.OWN;
  }

  return null;
}
