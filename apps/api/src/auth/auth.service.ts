import { Injectable } from '@nestjs/common';

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
  constructor(private readonly users: UsersService) {}

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
   */
  async resolve(dto: ResolveDto): Promise<ResolveResult> {
    if (!dto.emailVerified) {
      throw AppException.unauthorized(
        ErrorCode.EMAIL_UNVERIFIED,
        'Google email is not verified.',
      );
    }

    const user = await this.users.findByEmail(dto.email);

    if (!user) {
      const disabled = await this.users.isEmailDisabled(dto.email);

      if (disabled) {
        throw AppException.unauthorized(
          ErrorCode.USER_DISABLED,
          'User account is disabled.',
        );
      }

      throw AppException.unauthorized(
        ErrorCode.NOT_INVITED,
        'No invitation exists for this email.',
      );
    }

    if (!this.isSignInEligibleRole(user.roleCode)) {
      throw AppException.unauthorized(
        ErrorCode.NOT_INVITED,
        'Role is not eligible for sign-in.',
      );
    }

    await this.users.linkGoogleSub(user.id, dto.googleSub);

    return this.toResolveResult(user);
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
