import type { PermissionCode } from '../auth/permissions';
import type { RoleCode } from '../auth/roles';

/**
 * Per-request "current user" attached to `request.user` by `JwtGuard`.
 *
 * `roleCode` is widened to `string` so future custom roles (US-11.6) are
 * accepted without a code change here; the strict union catches typos in
 * code that compares against `ROLE.X`. Similarly `permissionCodes` is
 * widened — runtime values may include codes added after this file was
 * compiled.
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
}
