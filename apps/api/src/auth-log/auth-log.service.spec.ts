import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AUTH_LOG_EVENT, AUTH_LOG_MAX } from './auth-log.const';
import { AuthLogService } from './auth-log.service';
import type { AuthLogContext } from './auth-log.types';

const context: AuthLogContext = {
  ip: '127.0.0.1',
  userAgent: 'jest-test',
  path: '/api/v1/me',
  method: 'GET',
};

describe('AuthLogService', () => {
  let service: AuthLogService;
  const create = jest.fn<Promise<unknown>, [unknown]>();
  const prisma = { authLog: { create } } as unknown as PrismaService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(AuthLogService);
    create.mockReset();
    create.mockResolvedValue({});
  });

  it('logSignInSuccess writes a SIGN_IN_SUCCESS row with normalized email', async () => {
    await service.logSignInSuccess('user-1', '  Staff1@Gmail.COM  ', context);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toEqual({
      data: expect.objectContaining({
        event: AUTH_LOG_EVENT.SIGN_IN_SUCCESS,
        userId: 'user-1',
        email: 'staff1@gmail.com',
        reason: null,
        requiredPermissions: [],
        heldPermissions: [],
        ip: '127.0.0.1',
        userAgent: 'jest-test',
        path: '/api/v1/me',
        method: 'GET',
      }),
    });
  });

  it('logSignInFailure persists the reason code with a null userId', async () => {
    await service.logSignInFailure('stranger@gmail.com', 'NOT_INVITED', context);

    expect(create.mock.calls[0]![0]).toEqual({
      data: expect.objectContaining({
        event: AUTH_LOG_EVENT.SIGN_IN_FAILED,
        userId: null,
        email: 'stranger@gmail.com',
        reason: 'NOT_INVITED',
      }),
    });
  });

  it('logPermissionDenied preserves required + held arrays verbatim', async () => {
    await service.logPermissionDenied(
      'user-1',
      'staff1@gmail.com',
      ['permission.assign'],
      ['appointment.create', 'patient.list'],
      context,
    );

    expect(create.mock.calls[0]![0]).toEqual({
      data: expect.objectContaining({
        event: AUTH_LOG_EVENT.PERMISSION_DENIED,
        requiredPermissions: ['permission.assign'],
        heldPermissions: ['appointment.create', 'patient.list'],
      }),
    });
  });

  it('truncates oversized forensic fields to the column limits', async () => {
    const longUa = 'A'.repeat(AUTH_LOG_MAX.USER_AGENT + 200);
    const longPath = '/x'.repeat(AUTH_LOG_MAX.PATH);

    await service.logSignInSuccess('user-1', 'staff1@gmail.com', {
      ip: '0123456789'.repeat(10), // 100 chars
      userAgent: longUa,
      path: longPath,
      method: 'GETGETGETGETGETGETGET', // > 16
    });

    const data = (create.mock.calls[0]![0] as { data: Record<string, string> }).data;
    expect(data.userAgent).toHaveLength(AUTH_LOG_MAX.USER_AGENT);
    expect(data.path).toHaveLength(AUTH_LOG_MAX.PATH);
    expect(data.ip).toHaveLength(AUTH_LOG_MAX.IP);
    expect(data.method).toHaveLength(AUTH_LOG_MAX.METHOD);
  });

  it('swallows DB errors so a log failure never breaks the auth flow', async () => {
    create.mockRejectedValueOnce(new Error('db is on fire'));
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(
      service.logSignInSuccess('user-1', 'staff1@gmail.com', context),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
