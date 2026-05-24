import { Injectable } from '@nestjs/common';

import { AuthLogService } from '../auth-log/auth-log.service';
import type { AuthLogContext } from '../auth-log/auth-log.types';
import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from '../users/users.types';

import type { ResolveResult } from './auth.types';
import type { ResolveDto } from './dto/resolve.dto';
import type { PermissionCode } from './permissions';
import { SIGN_IN_ELIGIBLE_ROLES, type RoleCode } from './roles';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly authLog: AuthLogService,
  ) {}

  /**
   * Resolve a Google profile to an existing user row and return the
   * identity-and-permissions tuple the FE bakes into the JWT.
   *
   * Acceptance rules (US-2.3, US-3.1):
   *  - Reject unverified Google emails with `EMAIL_UNVERIFIED`.
   *  - Reject emails with no active user via `NOT_INVITED` (admins pre-create).
   *  - Reject emails whose user row is soft-deleted via `USER_DISABLED`.
   *  - Reject users whose role is not in `SIGN_IN_ELIGIBLE_ROLES` with
   *    `NOT_INVITED` — a defensive guard against future custom roles
   *    accidentally becoming sign-in-able.
   *
   * On success, link the Google `sub` to the user (idempotent) and return
   * the permission codes loaded from the role's active policies.
   *
   * Every outcome (success or rejection) writes a single row to
   * `auth_logs`. Writes are fire-and-forget — a log failure never breaks
   * the auth response.
   */
  async resolve(dto: ResolveDto, context: AuthLogContext): Promise<ResolveResult> {
    if (!dto.emailVerified) {
      await this.authLog.logSignInFailure(dto.email, ErrorCode.EMAIL_UNVERIFIED, context);

      throw AppException.unauthorized(
        ErrorCode.EMAIL_UNVERIFIED,
        'Google email is not verified.',
      );
    }

    const user = await this.users.findByEmail(dto.email);

    if (!user) {
      const disabled = await this.users.isEmailDisabled(dto.email);
      const reason = disabled ? ErrorCode.USER_DISABLED : ErrorCode.NOT_INVITED;
      const message = disabled
        ? 'User account is disabled.'
        : 'No invitation exists for this email.';

      await this.authLog.logSignInFailure(dto.email, reason, context);

      throw AppException.unauthorized(reason, message);
    }

    if (!this.isSignInEligibleRole(user.roleCode)) {
      await this.authLog.logSignInFailure(dto.email, ErrorCode.NOT_INVITED, context);

      throw AppException.unauthorized(
        ErrorCode.NOT_INVITED,
        'Role is not eligible for sign-in.',
      );
    }

    await this.users.linkGoogleSub(user.id, dto.googleSub);

    await this.authLog.logSignInSuccess(user.id, user.email, context);

    return this.toResolveResult(user);
  }

  /**
   * Records a sign-out event. The actual cookie clearing is handled by
   * NextAuth on the FE — this endpoint exists purely so the auth log gets
   * a row for voluntary session termination.
   */
  async signOut(user: AuthenticatedUser, context: AuthLogContext): Promise<void> {
    await this.authLog.logSignOut(user.id, user.email, context);
  }

  private isSignInEligibleRole(code: string): code is RoleCode {
    return (SIGN_IN_ELIGIBLE_ROLES as readonly string[]).includes(code);
  }

  private toResolveResult(user: AuthenticatedUser): ResolveResult {
    return {
      userId: user.id,
      roleCode: user.roleCode,
      permissionCodes: user.permissionCodes as PermissionCode[],
    };
  }
}
