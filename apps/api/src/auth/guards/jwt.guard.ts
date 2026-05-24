import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AppException } from '../../common/app-exception';
import { ErrorCode } from '../../common/errors';
import { UsersService } from '../../users/users.service';
import type { AuthenticatedUser } from '../../users/users.types';
import { INTERNAL_ROUTE_KEY } from '../decorators/internal-route.decorator';
import { PUBLIC_ROUTE_KEY } from '../decorators/public.decorator';
import {
  readBearerToken,
  readSessionCookie,
  verifySessionToken,
} from '../session-token';

/**
 * Verifies the NextAuth session JWT on every non-public request, loads the
 * caller's user + role policies, and attaches the result to
 * `request.user: AuthenticatedUser`.
 *
 * Routes opt out by being marked `@Public()` (liveness) or `@InternalRoute()`
 * (server-to-server resolve). The fresh DB read on every request means a
 * permission revoke takes effect immediately; the JWT is treated as identity
 * only.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.shouldSkip(context)) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const token =
      readSessionCookie(request.header('cookie')) ??
      readBearerToken(request.header('authorization'));

    if (!token) {
      throw AppException.unauthorized(
        ErrorCode.AUTH_MISSING_TOKEN,
        'Missing session token.',
      );
    }

    const secret = this.config.get<string>('NEXTAUTH_SECRET');

    if (!secret) {
      throw AppException.unauthorized(
        ErrorCode.AUTH_INVALID_TOKEN,
        'Session secret is not configured.',
      );
    }

    const payload = await verifySessionToken(token, secret).catch(() => null);

    if (!payload) {
      throw AppException.unauthorized(
        ErrorCode.AUTH_INVALID_TOKEN,
        'Invalid or expired session token.',
      );
    }

    const user = await this.users.findActiveById(payload.userId);

    if (!user) {
      throw AppException.unauthorized(
        ErrorCode.USER_DISABLED,
        'User is disabled or no longer exists.',
      );
    }

    request.user = user;

    return true;
  }

  private shouldSkip(context: ExecutionContext): boolean {
    const flags = this.reflector.getAllAndOverride<boolean | undefined>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (flags) {
      return true;
    }

    const isInternal = this.reflector.getAllAndOverride<boolean | undefined>(
      INTERNAL_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return Boolean(isInternal);
  }
}
