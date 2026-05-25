import type { PermissionCode } from '../auth/permissions';
import type { RoleCode } from '../auth/roles';

/**
 * Thin per-request reference to the caller's clinical record. Only DOCTOR
 * users carry this (their 1-1 `Doctor` row); STAFF / ADMIN users have no
 * `doctor` row and surface here as `null`.
 *
 * Consumed by feature-level scope guards (e.g. F06 schedule.scope) to
 * enforce "this DOCTOR can only act on their own schedules" without a
 * second round-trip on every mutation.
 */
export interface AuthenticatedDoctor {
  id: string;
}

/**
 * Per-request "current user" attached to `request.user` by `JwtGuard`.
 *
 * `roleCode` is widened to `string` so future custom roles (US-11.6) are
 * accepted without a code change here; the strict union catches typos in
 * code that compares against `ROLE.X`. Similarly `permissionCodes` is
 * widened — runtime values may include codes added after this file was
 * compiled.
 *
 * `doctor` is populated only when the user holds a `Doctor` row (DOCTOR
 * role). STAFF / ADMIN see `null` here.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roleId: string;
  roleCode: RoleCode | string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
  picture: string | null;
  permissionCodes: (PermissionCode | string)[];
  doctor: AuthenticatedDoctor | null;
}
