import { Test } from '@nestjs/testing';

import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from '../users/users.types';

import { AuthService } from './auth.service';
import type { ResolveDto } from './dto/resolve.dto';
import { PERMISSION } from './permissions';
import { DEFAULT_ROLE_PERMISSIONS, ROLE } from './roles';

const baseDto: ResolveDto = {
  email: 'staff1@gmail.com',
  googleSub: 'g-abc',
  emailVerified: true,
  name: 'Pim Sukjai',
  picture: null,
};

function buildUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'staff1@gmail.com',
    roleId: 'role-staff',
    roleCode: ROLE.STAFF,
    firstNameEn: 'Pim',
    lastNameEn: 'Sukjai',
    firstNameTh: null,
    lastNameTh: null,
    picture: null,
    permissionCodes: [...DEFAULT_ROLE_PERMISSIONS[ROLE.STAFF]],
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

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    Object.values(users).forEach((fn) => fn.mockReset());
  });

  it('resolves an active STAFF user to its 11-permission set', async () => {
    users.findByEmail.mockResolvedValue(buildUser());
    users.linkGoogleSub.mockResolvedValue(undefined);

    const result = await service.resolve(baseDto);

    expect(result.userId).toBe('user-1');
    expect(result.roleCode).toBe(ROLE.STAFF);
    expect(result.permissionCodes).toHaveLength(DEFAULT_ROLE_PERMISSIONS[ROLE.STAFF].length);
    expect(users.linkGoogleSub).toHaveBeenCalledWith('user-1', 'g-abc');
  });

  it('resolves an ADMIN user with the 5 user/role/policy permissions', async () => {
    users.findByEmail.mockResolvedValue(
      buildUser({
        roleCode: ROLE.ADMIN,
        permissionCodes: [...DEFAULT_ROLE_PERMISSIONS[ROLE.ADMIN]],
      }),
    );

    const result = await service.resolve(baseDto);

    expect(result.roleCode).toBe(ROLE.ADMIN);
    expect(result.permissionCodes).toContain(PERMISSION.PERMISSION_ASSIGN);
    expect(result.permissionCodes).not.toContain(PERMISSION.APPOINTMENT_CREATE);
  });

  it('resolves a DOCTOR user with the schedule.manage permission only', async () => {
    users.findByEmail.mockResolvedValue(
      buildUser({
        roleCode: ROLE.DOCTOR,
        permissionCodes: [...DEFAULT_ROLE_PERMISSIONS[ROLE.DOCTOR]],
      }),
    );

    const result = await service.resolve(baseDto);

    expect(result.roleCode).toBe(ROLE.DOCTOR);
    expect(result.permissionCodes).toEqual([PERMISSION.SCHEDULE_MANAGE]);
  });

  it('rejects an unverified Google email with EMAIL_UNVERIFIED', async () => {
    const promise = service.resolve({ ...baseDto, emailVerified: false });

    await expect(promise).rejects.toThrow(AppException);
    await promise.catch((err: AppException) => {
      expect(err.code).toBe(ErrorCode.EMAIL_UNVERIFIED);
    });
    expect(users.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects unknown emails with NOT_INVITED', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.isEmailDisabled.mockResolvedValue(false);

    await expect(service.resolve(baseDto)).rejects.toMatchObject({
      code: ErrorCode.NOT_INVITED,
    });
  });

  it('rejects soft-deleted users with USER_DISABLED', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.isEmailDisabled.mockResolvedValue(true);

    await expect(service.resolve(baseDto)).rejects.toMatchObject({
      code: ErrorCode.USER_DISABLED,
    });
  });

  it('rejects users whose role is not in SIGN_IN_ELIGIBLE_ROLES', async () => {
    users.findByEmail.mockResolvedValue(
      buildUser({ roleCode: 'CUSTOM_ROLE', permissionCodes: [] }),
    );

    await expect(service.resolve(baseDto)).rejects.toMatchObject({
      code: ErrorCode.NOT_INVITED,
    });
    expect(users.linkGoogleSub).not.toHaveBeenCalled();
  });
});
