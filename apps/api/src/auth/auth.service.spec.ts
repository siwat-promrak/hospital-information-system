import { Test } from '@nestjs/testing';

import { AuthLogService } from '../auth-log/auth-log.service';
import type { AuthLogContext } from '../auth-log/auth-log.types';
import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from '../users/users.types';

import { AuthService } from './auth.service';
import type { ResolveDto } from './dto/resolve.dto';
import { PERMISSION } from './permissions';
import { DEFAULT_ROLE_PERMISSIONS, ROLE } from './roles';

const baseDto: ResolveDto = {
  email: 'nurse1@gmail.com',
  googleSub: 'g-abc',
  emailVerified: true,
  name: 'Pim Sukjai',
  picture: null,
};

const noContext: AuthLogContext = {
  ip: null,
  userAgent: null,
  path: null,
  method: null,
};

function buildUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'nurse1@gmail.com',
    roleId: 'role-nurse',
    roleCode: ROLE.NURSE,
    firstNameEn: 'Pim',
    lastNameEn: 'Sukjai',
    firstNameTh: null,
    lastNameTh: null,
    picture: null,
    departmentId: 'dept-uuid',
    permissionCodes: [...DEFAULT_ROLE_PERMISSIONS[ROLE.NURSE]],
    doctor: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  const users = {
    findByEmail: jest.fn<Promise<AuthenticatedUser | null>, [string]>(),
    isEmailDisabled: jest.fn<Promise<boolean>, [string]>(),
    linkGoogleSub: jest.fn<Promise<void>, [string, string]>(),
  };
  const authLog = {
    logSignInSuccess: jest.fn<Promise<void>, [string, string, AuthLogContext?]>(),
    logSignInFailure: jest.fn<Promise<void>, [string, string, AuthLogContext?]>(),
    logSignOut: jest.fn<Promise<void>, [string, string | null, AuthLogContext?]>(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: AuthLogService, useValue: authLog },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    Object.values(users).forEach((fn) => fn.mockReset());
    Object.values(authLog).forEach((fn) => fn.mockReset());
  });

  it('resolves an active NURSE user to its full NURSE permission set', async () => {
    users.findByEmail.mockResolvedValue(buildUser());
    users.linkGoogleSub.mockResolvedValue(undefined);

    const result = await service.resolve(baseDto, noContext);

    expect(result.userId).toBe('user-1');
    expect(result.roleCode).toBe(ROLE.NURSE);
    expect(result.permissionCodes).toHaveLength(DEFAULT_ROLE_PERMISSIONS[ROLE.NURSE].length);
    expect(users.linkGoogleSub).toHaveBeenCalledWith('user-1', 'g-abc');
    expect(authLog.logSignInSuccess).toHaveBeenCalledWith(
      'user-1',
      'nurse1@gmail.com',
      noContext,
    );
    expect(authLog.logSignInFailure).not.toHaveBeenCalled();
  });

  it('resolves an ADMIN user with the user / role management permissions', async () => {
    users.findByEmail.mockResolvedValue(
      buildUser({
        roleCode: ROLE.ADMIN,
        permissionCodes: [...DEFAULT_ROLE_PERMISSIONS[ROLE.ADMIN]],
      }),
    );

    const result = await service.resolve(baseDto, noContext);

    expect(result.roleCode).toBe(ROLE.ADMIN);
    expect(result.permissionCodes).toContain(PERMISSION.ROLE_UPDATE);
    expect(result.permissionCodes).toContain(PERMISSION.USER_CREATE);
    expect(result.permissionCodes).not.toContain(
      PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
    );
  });

  it('resolves a DOCTOR user with the schedule.create.own permission among others', async () => {
    users.findByEmail.mockResolvedValue(
      buildUser({
        roleCode: ROLE.DOCTOR,
        permissionCodes: [...DEFAULT_ROLE_PERMISSIONS[ROLE.DOCTOR]],
      }),
    );

    const result = await service.resolve(baseDto, noContext);

    expect(result.roleCode).toBe(ROLE.DOCTOR);
    expect(result.permissionCodes).toContain(PERMISSION.SCHEDULE_CREATE_OWN);
    expect(result.permissionCodes).toContain(PERMISSION.MEDICAL_RECORDS_CREATE_OWN);
    expect(result.permissionCodes).toContain(PERMISSION.APPOINTMENT_CREATE_OWN);
    expect(result.permissionCodes).toContain(PERMISSION.PATIENT_READ);
  });

  it('rejects an unverified Google email with EMAIL_UNVERIFIED and logs the failure', async () => {
    const promise = service.resolve({ ...baseDto, emailVerified: false }, noContext);

    await expect(promise).rejects.toThrow(AppException);
    await promise.catch((err: AppException) => {
      expect(err.code).toBe(ErrorCode.EMAIL_UNVERIFIED);
    });
    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(authLog.logSignInFailure).toHaveBeenCalledWith(
      baseDto.email,
      ErrorCode.EMAIL_UNVERIFIED,
      noContext,
    );
  });

  it('rejects unknown emails with NOT_INVITED and logs the failure', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.isEmailDisabled.mockResolvedValue(false);

    await expect(service.resolve(baseDto, noContext)).rejects.toMatchObject({
      code: ErrorCode.NOT_INVITED,
    });
    expect(authLog.logSignInFailure).toHaveBeenCalledWith(
      baseDto.email,
      ErrorCode.NOT_INVITED,
      noContext,
    );
  });

  it('rejects soft-deleted users with USER_DISABLED and logs the failure', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.isEmailDisabled.mockResolvedValue(true);

    await expect(service.resolve(baseDto, noContext)).rejects.toMatchObject({
      code: ErrorCode.USER_DISABLED,
    });
    expect(authLog.logSignInFailure).toHaveBeenCalledWith(
      baseDto.email,
      ErrorCode.USER_DISABLED,
      noContext,
    );
  });

  it('rejects users whose role is not in SIGN_IN_ELIGIBLE_ROLES', async () => {
    users.findByEmail.mockResolvedValue(
      buildUser({ roleCode: 'CUSTOM_ROLE', permissionCodes: [] }),
    );

    await expect(service.resolve(baseDto, noContext)).rejects.toMatchObject({
      code: ErrorCode.NOT_INVITED,
    });
    expect(users.linkGoogleSub).not.toHaveBeenCalled();
    expect(authLog.logSignInFailure).toHaveBeenCalledWith(
      baseDto.email,
      ErrorCode.NOT_INVITED,
      noContext,
    );
  });

  it('signOut writes a SIGN_OUT auth-log row for the calling user', async () => {
    const user = buildUser();

    await service.signOut(user, noContext);

    expect(authLog.logSignOut).toHaveBeenCalledWith(user.id, user.email, noContext);
  });
});
