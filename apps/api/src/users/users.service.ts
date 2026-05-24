import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { normalizeEmail } from '../common/normalize-email';
import { PrismaService } from '../prisma/prisma.service';

import type { AuthenticatedUser } from './users.types';

/**
 * Shared `include` for every user-with-permissions lookup. Defining it as a
 * `Prisma.validator()` keeps the inferred row type in sync with the actual
 * query.
 */
const userWithPermissionsInclude = Prisma.validator<Prisma.UserInclude>()({
  role: {
    include: {
      policies: {
        where: { deletedAt: null },
        include: { permission: true },
      },
    },
  },
});

type UserWithPermissions = Prisma.UserGetPayload<{
  include: typeof userWithPermissionsInclude;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a user by id together with their role and the **active** policies
   * for that role. Returns `null` when the user is missing or soft-deleted
   * (the request handler treats both as "no current user").
   *
   * The active-policy filter (`deletedAt: null`) is applied to the joined
   * `policies` so a revoked policy stops contributing its permission code
   * immediately — the resolver does NOT cache between requests.
   */
  async findActiveById(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userWithPermissionsInclude,
    });

    return user ? this.toAuthenticatedUser(user) : null;
  }

  /**
   * Resolve a user by lowercased email. Used by the resolve flow on first
   * sign-in. Returns `null` for unknown or soft-deleted emails; the caller
   * decides whether that maps to NOT_INVITED or USER_DISABLED.
   */
  async findByEmail(rawEmail: string): Promise<AuthenticatedUser | null> {
    const email = normalizeEmail(rawEmail);
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: userWithPermissionsInclude,
    });

    return user ? this.toAuthenticatedUser(user) : null;
  }

  /**
   * `true` iff the email exists with a `deletedAt` timestamp — used to
   * distinguish USER_DISABLED from NOT_INVITED in the resolve flow.
   */
  async isEmailDisabled(rawEmail: string): Promise<boolean> {
    const email = normalizeEmail(rawEmail);
    const user = await this.prisma.user.findFirst({
      where: { email, NOT: { deletedAt: null } },
      select: { id: true },
    });

    return Boolean(user);
  }

  /**
   * Link a Google subject id to an existing user on first sign-in.
   *
   * Uses `updateMany` with a NULL-only filter so concurrent sign-ins on the
   * same user are idempotent: only the first writer fills the column; the
   * second is a no-op (and never overwrites a different `sub`).
   */
  async linkGoogleSub(userId: string, googleSub: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, googleSub: null },
      data: { googleSub },
    });
  }

  private toAuthenticatedUser(user: UserWithPermissions): AuthenticatedUser | null {
    if (!user.role) {
      return null;
    }

    const permissionCodes = user.role.policies
      .filter((policy) => policy.permission.deletedAt === null)
      .map((policy) => policy.permission.code);

    return {
      id: user.id,
      email: user.email,
      roleId: user.role.id,
      roleCode: user.role.code,
      firstNameEn: user.firstNameEn,
      lastNameEn: user.lastNameEn,
      firstNameTh: user.firstNameTh,
      lastNameTh: user.lastNameTh,
      picture: user.picture,
      permissionCodes,
    };
  }
}
