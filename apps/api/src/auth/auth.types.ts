import type { JWTPayload } from 'jose';

import type { RoleCode } from './roles';

/**
 * Shape of the session JWT minted by the Next.js NextAuth handler.
 *
 * The `signIn` callback embeds `userId` + `roleCode` so the API does not
 * have to look up the user on every request just to decide who they are;
 * the authoritative permission set is still re-read from the DB per
 * request by `PermissionsGuard`.
 *
 * `roleCode` is typed as `RoleCode | string` rather than the strict union
 * so future custom roles (US-11.6) are accepted without a JWT shape change.
 */
export interface SessionTokenPayload extends JWTPayload {
  sub: string;
  userId: string;
  email: string;
  roleCode: RoleCode | string;
}
