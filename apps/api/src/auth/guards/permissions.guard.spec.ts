import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AppException } from '../../common/app-exception';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../users/users.types';
import { INTERNAL_ROUTE_KEY } from '../decorators/internal-route.decorator';
import { PUBLIC_ROUTE_KEY } from '../decorators/public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { PERMISSION } from '../permissions';
import { ROLE } from '../roles';

import { PermissionsGuard } from './permissions.guard';

function makeContext(user: AuthenticatedUser | undefined): ExecutionContext {
  const handler = (): void => undefined;
  const cls = class {};

  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function makeReflector(metadata: Partial<Record<string, unknown>>): Reflector {
  return {
    getAllAndOverride: <T = unknown>(key: string): T | undefined => metadata[key] as T | undefined,
  } as unknown as Reflector;
}

function buildUser(codes: string[]): AuthenticatedUser {
  return {
    id: 'u',
    email: 'u@x.y',
    roleId: 'r',
    roleCode: ROLE.STAFF,
    firstNameEn: 'U',
    lastNameEn: 'X',
    firstNameTh: null,
    lastNameTh: null,
    picture: null,
    permissionCodes: codes,
  };
}

describe('PermissionsGuard', () => {
  it('passes for public routes regardless of attached user', () => {
    const guard = new PermissionsGuard(makeReflector({ [PUBLIC_ROUTE_KEY]: true }));

    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('passes for internal routes', () => {
    const guard = new PermissionsGuard(makeReflector({ [INTERNAL_ROUTE_KEY]: true }));

    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('passes when no @RequirePermission metadata is set', () => {
    const guard = new PermissionsGuard(makeReflector({}));

    expect(guard.canActivate(makeContext(buildUser([])))).toBe(true);
  });

  it('passes when the user holds at least one required code', () => {
    const guard = new PermissionsGuard(
      makeReflector({ [REQUIRED_PERMISSIONS_KEY]: [PERMISSION.SCHEDULE_MANAGE] }),
    );

    expect(
      guard.canActivate(makeContext(buildUser([PERMISSION.SCHEDULE_MANAGE]))),
    ).toBe(true);
  });

  it('rejects with INSUFFICIENT_PERMISSION when the user is missing the code', () => {
    const guard = new PermissionsGuard(
      makeReflector({ [REQUIRED_PERMISSIONS_KEY]: [PERMISSION.PERMISSION_ASSIGN] }),
    );

    try {
      guard.canActivate(makeContext(buildUser([PERMISSION.APPOINTMENT_CREATE])));
      fail('expected guard to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.INSUFFICIENT_PERMISSION);
      expect((err as AppException).details).toEqual({
        required: [PERMISSION.PERMISSION_ASSIGN],
        held: [PERMISSION.APPOINTMENT_CREATE],
      });
    }
  });

  it('rejects when no user is attached even if metadata is present', () => {
    const guard = new PermissionsGuard(
      makeReflector({ [REQUIRED_PERMISSIONS_KEY]: [PERMISSION.SCHEDULE_MANAGE] }),
    );

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(AppException);
  });
});
