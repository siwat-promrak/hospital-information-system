import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import { ROLE } from '../auth/roles';
import type { AuthenticatedUser } from '../users/users.types';

/**
 * Service-layer scope guard for F06 doctor schedules.
 *
 * STAFF / ADMIN (with `schedule.manage`) operate unrestricted. DOCTOR is
 * additionally constrained to their own `Doctor.id`:
 *  - reads (list, get) are filtered down to `doctorId === caller.doctor.id`,
 *  - mutations (create, update, delete) verify the row / payload's
 *    `doctorId` against the same field BEFORE touching the DB.
 *
 * Failure throws `403 INSUFFICIENT_PERMISSION_SCOPE` — different error
 * code from the route-permission rejection (`INSUFFICIENT_PERMISSION`) so
 * the FE can distinguish "you don't have this permission at all" from "you
 * have it but only for your own data".
 *
 * A DOCTOR user without a linked `Doctor` row is a data-integrity bug
 * (see F02 invariants) — we still reject with the same code so the API
 * fails closed.
 */

/**
 * `true` iff the caller's effective scope is restricted to a single
 * doctor (i.e. role === DOCTOR). Centralised here so the service does not
 * branch on `roleCode` directly.
 */
export function isDoctorScoped(user: AuthenticatedUser): boolean {
  return user.roleCode === ROLE.DOCTOR;
}

/**
 * Returns the `doctorId` a DOCTOR caller is restricted to, or `null` for
 * unrestricted callers (STAFF / ADMIN). Throws if the caller is a DOCTOR
 * but somehow lacks a linked `Doctor` row.
 */
export function getScopedDoctorId(user: AuthenticatedUser): string | null {
  if (!isDoctorScoped(user)) {
    return null;
  }

  if (!user.doctor) {
    throw AppException.forbidden(
      ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      'DOCTOR user is missing a linked Doctor record.',
    );
  }

  return user.doctor.id;
}

/**
 * Assert the caller is allowed to act on a row owned by `targetDoctorId`.
 * Pass-through for STAFF / ADMIN; for DOCTOR, raises
 * `403 INSUFFICIENT_PERMISSION_SCOPE` when the target is not their own
 * doctor row.
 */
export function assertCanActOnDoctor(
  user: AuthenticatedUser,
  targetDoctorId: string,
): void {
  const scopedDoctorId = getScopedDoctorId(user);

  if (scopedDoctorId === null) {
    return;
  }

  if (scopedDoctorId !== targetDoctorId) {
    throw AppException.forbidden(
      ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      'DOCTOR users may only manage their own schedules.',
    );
  }
}
