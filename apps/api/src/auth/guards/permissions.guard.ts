import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AuthLogService } from '../../auth-log/auth-log.service';
import { buildAuthLogContext } from '../../auth-log/request-context';
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
 *  - Otherwise → 403 `INSUFFICIENT_PERMISSION` with `{ required, held }`
 *    AND a `PERMISSION_DENIED` row in `auth_logs`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authLog: AuthLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
      await this.recordDenial(request, null, null, required, []);

      throw AppException.insufficientPermission(required, []);
    }

    const held = user.permissionCodes;
    const granted = required.some((code) => held.includes(code));

    if (!granted) {
      await this.recordDenial(request, user.id, user.email, required, [...held]);

      throw AppException.insufficientPermission(required, held);
    }

    return true;
  }

  private recordDenial(
    request: Request,
    userId: string | null,
    email: string | null,
    required: string[],
    held: string[],
  ): Promise<void> {
    return this.authLog.logPermissionDenied(
      userId,
      email,
      required,
      held,
      buildAuthLogContext(request),
    );
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
