import { Injectable, Logger } from '@nestjs/common';

import { normalizeEmail } from '../common/normalize-email';
import { PrismaService } from '../prisma/prisma.service';

import { AUTH_LOG_EVENT, AUTH_LOG_MAX } from './auth-log.const';
import type { AuthLogContext, AuthLogPayload } from './auth-log.types';

const EMPTY_CONTEXT: AuthLogContext = {
  ip: null,
  userAgent: null,
  path: null,
  method: null,
};

/**
 * Append-only writer for `auth_logs`. Every method is fire-and-forget:
 * failures are logged and swallowed so an unavailable audit table never
 * breaks the auth flow. Callers can `await` the returned promise when they
 * need ordering (e.g. tests), but they don't have to.
 */
@Injectable()
export class AuthLogService {
  private readonly logger = new Logger(AuthLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(payload: AuthLogPayload): Promise<void> {
    try {
      await this.prisma.authLog.create({
        data: {
          event: payload.event,
          userId: payload.userId,
          email: payload.email ? normalizeEmail(payload.email) : null,
          reason: payload.reason,
          requiredPermissions: payload.requiredPermissions,
          heldPermissions: payload.heldPermissions,
          path: truncate(payload.path, AUTH_LOG_MAX.PATH),
          method: truncate(payload.method, AUTH_LOG_MAX.METHOD),
          ip: truncate(payload.ip, AUTH_LOG_MAX.IP),
          userAgent: truncate(payload.userAgent, AUTH_LOG_MAX.USER_AGENT),
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write auth_log (${payload.event}): ${(err as Error).message}`,
      );
    }
  }

  logSignInSuccess(
    userId: string,
    email: string,
    context: AuthLogContext = EMPTY_CONTEXT,
  ): Promise<void> {
    return this.record({
      event: AUTH_LOG_EVENT.SIGN_IN_SUCCESS,
      userId,
      email,
      reason: null,
      requiredPermissions: [],
      heldPermissions: [],
      ...context,
    });
  }

  logSignInFailure(
    email: string,
    reason: string,
    context: AuthLogContext = EMPTY_CONTEXT,
  ): Promise<void> {
    return this.record({
      event: AUTH_LOG_EVENT.SIGN_IN_FAILED,
      userId: null,
      email,
      reason,
      requiredPermissions: [],
      heldPermissions: [],
      ...context,
    });
  }

  logPermissionDenied(
    userId: string | null,
    email: string | null,
    required: string[],
    held: string[],
    context: AuthLogContext = EMPTY_CONTEXT,
  ): Promise<void> {
    return this.record({
      event: AUTH_LOG_EVENT.PERMISSION_DENIED,
      userId,
      email,
      reason: null,
      requiredPermissions: required,
      heldPermissions: held,
      ...context,
    });
  }

  logSignOut(
    userId: string,
    email: string | null,
    context: AuthLogContext = EMPTY_CONTEXT,
  ): Promise<void> {
    return this.record({
      event: AUTH_LOG_EVENT.SIGN_OUT,
      userId,
      email,
      reason: null,
      requiredPermissions: [],
      heldPermissions: [],
      ...context,
    });
  }
}

function truncate(value: string | null, max: number): string | null {
  if (value === null) {
    return null;
  }

  if (value.length <= max) {
    return value;
  }

  return value.slice(0, max);
}
