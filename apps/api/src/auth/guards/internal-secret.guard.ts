import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { AppException } from '../../common/app-exception';
import { ErrorCode } from '../../common/errors';
import { INTERNAL_SECRET_HEADER } from '../auth.const';
import { INTERNAL_ROUTE_KEY } from '../decorators/internal-route.decorator';

/**
 * Guards routes marked with `@InternalRoute()` (currently `POST /auth/resolve`).
 *
 * The Next.js server-side handler proxies the resolve call with a shared
 * secret in the `X-Internal-Secret` header so end-users cannot hit the
 * endpoint directly. The comparison is constant-time to avoid leaking the
 * secret via timing analysis.
 *
 * Non-internal routes are passed through untouched — the global `JwtGuard`
 * is the gatekeeper for normal traffic.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isInternal = this.reflector.getAllAndOverride<boolean>(INTERNAL_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isInternal) {
      return true;
    }

    const expected = this.config.get<string>('INTERNAL_API_SECRET');

    if (!expected) {
      throw AppException.unauthorized(
        ErrorCode.AUTH_INTERNAL_FORBIDDEN,
        'Internal API secret is not configured.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header(INTERNAL_SECRET_HEADER);

    if (!provided || !this.safeEqual(provided, expected)) {
      throw AppException.unauthorized(
        ErrorCode.AUTH_INTERNAL_FORBIDDEN,
        'Missing or invalid internal API secret.',
      );
    }

    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);

    if (aBuf.length !== bBuf.length) {
      return false;
    }

    return timingSafeEqual(aBuf, bBuf);
  }
}
