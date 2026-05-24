import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../../users/users.types';

/**
 * Resolves the authenticated user attached to the request by `JwtGuard` +
 * `PermissionsGuard`. Returns `undefined` on routes opted out via `@Public()`
 * — controllers MUST handle that case (or rely on the guard always firing).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    return request.user;
  },
);
