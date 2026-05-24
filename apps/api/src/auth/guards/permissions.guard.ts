import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AppException } from '../../common/app-exception';
import type { AuthenticatedUser } from '../../users/users.types';
import { INTERNAL_ROUTE_KEY } from '../decorators/internal-route.decorator';
import { PUBLIC_ROUTE_KEY } from '../decorators/public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

/**
 * Authorises requests against the permission codes declared via
 * `@RequirePermission(...)`. Runs after `JwtGuard`, which has already
 * attached `request.user.permissionCodes`.
 *
 * Behaviour:
 *  - No `@RequirePermission()` on the handler → pass (any signed-in user).
 *  - Caller holds at least one of the declared codes → pass.
 *  - Otherwise → 403 `INSUFFICIENT_PERMISSION` with `{ required, held }`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.shouldSkip(context)) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const user = request.user;

    if (!user) {
      throw AppException.insufficientPermission(required, []);
    }

    const held = user.permissionCodes;
    const granted = required.some((code) => held.includes(code));

    if (!granted) {
      throw AppException.insufficientPermission(required, held);
    }

    return true;
  }

  private shouldSkip(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const isInternal = this.reflector.getAllAndOverride<boolean | undefined>(
      INTERNAL_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return Boolean(isInternal);
  }
}
