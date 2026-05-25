import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthLogService } from '../../auth-log/auth-log.service';
import { AppException } from '../../common/app-exception';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../users/users.types';
import { INTERNAL_ROUTE_KEY } from '../decorators/internal-route.decorator';
import { PUBLIC_ROUTE_KEY } from '../decorators/public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { PERMISSION } from '../permissions';
import { ROLE } from '../roles';

import { PermissionsGuard } from './permissions.guard';

interface FakeRequest {
  user?: AuthenticatedUser;
  header?: (name: string) => string | undefined;
  ip?: string;
  originalUrl?: string;
  method?: string;
}

function makeContext(request: FakeRequest): ExecutionContext {
  const handler = (): void => undefined;
  const cls = class {};

  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({
        header: () => undefined,
        ip: '127.0.0.1',
        originalUrl: '/api/v1/me/permissions-check',
        method: 'GET',
        ...request,
      }),
    }),
  } as unknown as ExecutionContext;
}

function makeReflector(metadata: Partial<Record<string, unknown>>): Reflector {
  return {
    getAllAndOverride: <T = unknown>(key: string): T | undefined => metadata[key] as T | undefined,
  } as unknown as Reflector;
}

function buildAuthLogServiceMock(): jest.Mocked<Pick<AuthLogService, 'logPermissionDenied'>> {
  return {
    logPermissionDenied: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Pick<AuthLogService, 'logPermissionDenied'>>;
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
    doctor: null,
  };
}

describe('PermissionsGuard', () => {
  let authLog: jest.Mocked<Pick<AuthLogService, 'logPermissionDenied'>>;

  beforeEach(() => {
    authLog = buildAuthLogServiceMock();
  });

  it('passes for public routes regardless of attached user', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ [PUBLIC_ROUTE_KEY]: true }),
      authLog as unknown as AuthLogService,
    );

    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
    expect(authLog.logPermissionDenied).not.toHaveBeenCalled();
  });

  it('passes for internal routes', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ [INTERNAL_ROUTE_KEY]: true }),
      authLog as unknown as AuthLogService,
    );

    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
  });

  it('passes when no @RequirePermission metadata is set', async () => {
    const guard = new PermissionsGuard(
      makeReflector({}),
      authLog as unknown as AuthLogService,
    );

    await expect(
      guard.canActivate(makeContext({ user: buildUser([]) })),
    ).resolves.toBe(true);
  });

  it('passes when the user holds at least one required code', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ [REQUIRED_PERMISSIONS_KEY]: [PERMISSION.SCHEDULE_MANAGE] }),
      authLog as unknown as AuthLogService,
    );

    await expect(
      guard.canActivate(makeContext({ user: buildUser([PERMISSION.SCHEDULE_MANAGE]) })),
    ).resolves.toBe(true);
    expect(authLog.logPermissionDenied).not.toHaveBeenCalled();
  });

  it('rejects with INSUFFICIENT_PERMISSION and logs the denial with { required, held }', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ [REQUIRED_PERMISSIONS_KEY]: [PERMISSION.PERMISSION_ASSIGN] }),
      authLog as unknown as AuthLogService,
    );
    const user = buildUser([PERMISSION.APPOINTMENT_CREATE]);

    await expect(guard.canActivate(makeContext({ user }))).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSION,
      details: {
        required: [PERMISSION.PERMISSION_ASSIGN],
        held: [PERMISSION.APPOINTMENT_CREATE],
      },
    });
    await expect(
      guard.canActivate(makeContext({ user })),
    ).rejects.toBeInstanceOf(AppException);

    expect(authLog.logPermissionDenied).toHaveBeenCalledWith(
      user.id,
      user.email,
      [PERMISSION.PERMISSION_ASSIGN],
      [PERMISSION.APPOINTMENT_CREATE],
      expect.objectContaining({ ip: '127.0.0.1', method: 'GET' }),
    );
  });

  it('rejects when no user is attached and logs the denial with null user fields', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ [REQUIRED_PERMISSIONS_KEY]: [PERMISSION.SCHEDULE_MANAGE] }),
      authLog as unknown as AuthLogService,
    );

    await expect(
      guard.canActivate(makeContext({ user: undefined })),
    ).rejects.toBeInstanceOf(AppException);
    expect(authLog.logPermissionDenied).toHaveBeenCalledWith(
      null,
      null,
      [PERMISSION.SCHEDULE_MANAGE],
      [],
      expect.any(Object),
    );
  });
});
