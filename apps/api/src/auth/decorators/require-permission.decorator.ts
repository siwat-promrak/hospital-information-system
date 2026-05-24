import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'auth:requiredPermissions';

/**
 * Declares the permission codes a handler requires. The global
 * `PermissionsGuard` checks the caller's `permissionCodes` against this set
 * and rejects with `INSUFFICIENT_PERMISSION` if none match.
 *
 * Multiple codes are OR-ed: holding any one of them is enough. Endpoints
 * that need stricter AND semantics should declare a single composite code or
 * enforce the rest at the service layer.
 */
export const RequirePermission = (
  ...permissions: [string, ...string[]]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
