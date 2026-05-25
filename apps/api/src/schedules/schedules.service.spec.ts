import { Test } from '@nestjs/testing';

import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import { ROLE } from '../auth/roles';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import { checkScheduleWindow } from './decorators/schedule-window.decorator';
import {
  assertCanActOnDoctor,
  getScopedDoctorId,
  isDoctorScoped,
} from './schedule.scope';
import {
  assertDoctorInDepartment,
  assertNoOverlap,
  assertStartAtNotInPast,
  overlapsWindow,
} from './schedule.validation';
import { SchedulesService, resolveListRange } from './schedules.service';

const STAFF_USER: AuthenticatedUser = {
  id: 'user-staff',
  email: 'staff@example.com',
  roleId: 'role-staff',
  roleCode: ROLE.STAFF,
  firstNameEn: 'Staff',
  lastNameEn: 'One',
  firstNameTh: null,
  lastNameTh: null,
  picture: null,
  permissionCodes: ['schedule.manage'],
  doctor: null,
};

const DOCTOR_USER: AuthenticatedUser = {
  id: 'user-doctor',
  email: 'doctor@example.com',
  roleId: 'role-doctor',
  roleCode: ROLE.DOCTOR,
  firstNameEn: 'Doc',
  lastNameEn: 'Owner',
  firstNameTh: null,
  lastNameTh: null,
  picture: null,
  permissionCodes: ['schedule.manage'],
  doctor: { id: 'doctor-own' },
};

const dt = (iso: string): Date => new Date(iso);

describe('overlapsWindow', () => {
  it('returns false for disjoint windows', () => {
    expect(
      overlapsWindow(
        { startAt: dt('2026-06-01T09:00:00Z'), endAt: dt('2026-06-01T10:00:00Z') },
        { startAt: dt('2026-06-01T10:00:00Z'), endAt: dt('2026-06-01T11:00:00Z') },
      ),
    ).toBe(false);
  });

  it('returns true for exact match windows', () => {
    expect(
      overlapsWindow(
        { startAt: dt('2026-06-01T09:00:00Z'), endAt: dt('2026-06-01T10:00:00Z') },
        { startAt: dt('2026-06-01T09:00:00Z'), endAt: dt('2026-06-01T10:00:00Z') },
      ),
    ).toBe(true);
  });

  it('returns true for partial overlap on the left', () => {
    expect(
      overlapsWindow(
        { startAt: dt('2026-06-01T09:00:00Z'), endAt: dt('2026-06-01T10:00:00Z') },
        { startAt: dt('2026-06-01T09:30:00Z'), endAt: dt('2026-06-01T11:00:00Z') },
      ),
    ).toBe(true);
  });

  it('returns true for partial overlap on the right', () => {
    expect(
      overlapsWindow(
        { startAt: dt('2026-06-01T09:30:00Z'), endAt: dt('2026-06-01T11:00:00Z') },
        { startAt: dt('2026-06-01T09:00:00Z'), endAt: dt('2026-06-01T10:00:00Z') },
      ),
    ).toBe(true);
  });

  it('returns true when one window contains the other', () => {
    expect(
      overlapsWindow(
        { startAt: dt('2026-06-01T09:00:00Z'), endAt: dt('2026-06-01T12:00:00Z') },
        { startAt: dt('2026-06-01T10:00:00Z'), endAt: dt('2026-06-01T11:00:00Z') },
      ),
    ).toBe(true);
  });

  it('returns true when the candidate is contained by the sibling', () => {
    expect(
      overlapsWindow(
        { startAt: dt('2026-06-01T10:00:00Z'), endAt: dt('2026-06-01T11:00:00Z') },
        { startAt: dt('2026-06-01T09:00:00Z'), endAt: dt('2026-06-01T12:00:00Z') },
      ),
    ).toBe(true);
  });

  it('returns false for back-to-back windows (half-open semantics)', () => {
    expect(
      overlapsWindow(
        { startAt: dt('2026-06-01T09:00:00Z'), endAt: dt('2026-06-01T10:00:00Z') },
        { startAt: dt('2026-06-01T10:00:00Z'), endAt: dt('2026-06-01T12:00:00Z') },
      ),
    ).toBe(false);
  });

  it('returns false when on different dates', () => {
    expect(
      overlapsWindow(
        { startAt: dt('2026-06-01T09:00:00Z'), endAt: dt('2026-06-01T17:00:00Z') },
        { startAt: dt('2026-06-02T09:00:00Z'), endAt: dt('2026-06-02T17:00:00Z') },
      ),
    ).toBe(false);
  });
});

describe('assertStartAtNotInPast', () => {
  const NOW = new Date('2026-06-15T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('throws SCHEDULE_START_IN_PAST for a startAt strictly before now', () => {
    try {
      assertStartAtNotInPast('2026-06-14T12:00:00.000Z');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.SCHEDULE_START_IN_PAST);
      expect((err as AppException).getStatus()).toBe(400);
    }
  });

  it('throws SCHEDULE_START_IN_PAST when startAt equals now (boundary)', () => {
    try {
      assertStartAtNotInPast(NOW.toISOString());
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.SCHEDULE_START_IN_PAST);
    }
  });

  it('passes when startAt is strictly after now', () => {
    expect(() =>
      assertStartAtNotInPast('2026-06-16T12:00:00.000Z'),
    ).not.toThrow();
  });

  it('includes the offending startAt + now in the error details', () => {
    try {
      assertStartAtNotInPast('2026-06-14T12:00:00.000Z');
      fail('expected throw');
    } catch (err) {
      expect((err as AppException).details).toEqual({
        startAt: '2026-06-14T12:00:00.000Z',
        now: NOW.toISOString(),
      });
    }
  });
});

describe('checkScheduleWindow', () => {
  it('passes a well-formed window with no break', () => {
    expect(
      checkScheduleWindow({
        startAt: '2026-06-01T09:00:00Z',
        endAt: '2026-06-01T12:00:00Z',
      }),
    ).toBeNull();
  });

  it('rejects endAt <= startAt', () => {
    expect(
      checkScheduleWindow({
        startAt: '2026-06-01T12:00:00Z',
        endAt: '2026-06-01T09:00:00Z',
      }),
    ).toMatch(/strictly greater/);
  });

  it('rejects a break window outside the working window', () => {
    expect(
      checkScheduleWindow({
        startAt: '2026-06-01T09:00:00Z',
        endAt: '2026-06-01T11:00:00Z',
        breakStartAt: '2026-06-01T13:00:00Z',
        breakEndAt: '2026-06-01T13:30:00Z',
      }),
    ).toMatch(/<= endAt/);
  });

  it('rejects half-set break fields', () => {
    expect(
      checkScheduleWindow({
        startAt: '2026-06-01T09:00:00Z',
        endAt: '2026-06-01T12:00:00Z',
        breakStartAt: '2026-06-01T10:00:00Z',
      }),
    ).toMatch(/together/);
  });

  it('rejects break start >= break end', () => {
    expect(
      checkScheduleWindow({
        startAt: '2026-06-01T09:00:00Z',
        endAt: '2026-06-01T12:00:00Z',
        breakStartAt: '2026-06-01T11:00:00Z',
        breakEndAt: '2026-06-01T10:00:00Z',
      }),
    ).toMatch(/strictly less than breakEndAt/);
  });

  it('rejects breakStartAt before startAt', () => {
    expect(
      checkScheduleWindow({
        startAt: '2026-06-01T09:00:00Z',
        endAt: '2026-06-01T12:00:00Z',
        breakStartAt: '2026-06-01T08:00:00Z',
        breakEndAt: '2026-06-01T08:30:00Z',
      }),
    ).toMatch(/>= startAt/);
  });
});

describe('scope helpers', () => {
  it('isDoctorScoped only fires for DOCTOR', () => {
    expect(isDoctorScoped(STAFF_USER)).toBe(false);
    expect(isDoctorScoped(DOCTOR_USER)).toBe(true);
  });

  it('getScopedDoctorId returns null for STAFF and the linked id for DOCTOR', () => {
    expect(getScopedDoctorId(STAFF_USER)).toBeNull();
    expect(getScopedDoctorId(DOCTOR_USER)).toBe('doctor-own');
  });

  it('getScopedDoctorId throws if a DOCTOR has no linked Doctor row', () => {
    expect(() =>
      getScopedDoctorId({ ...DOCTOR_USER, doctor: null }),
    ).toThrow(AppException);
  });

  it('assertCanActOnDoctor passes for STAFF on any target', () => {
    expect(() => assertCanActOnDoctor(STAFF_USER, 'any-doctor')).not.toThrow();
  });

  it('assertCanActOnDoctor passes for DOCTOR on own id', () => {
    expect(() => assertCanActOnDoctor(DOCTOR_USER, 'doctor-own')).not.toThrow();
  });

  it('assertCanActOnDoctor throws INSUFFICIENT_PERMISSION_SCOPE for DOCTOR on foreign id', () => {
    try {
      assertCanActOnDoctor(DOCTOR_USER, 'doctor-other');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      );
      expect((err as AppException).getStatus()).toBe(403);
    }
  });
});

describe('assertDoctorInDepartment', () => {
  const buildTx = (returnRow: { id: string } | null) =>
    ({
      doctorDepartment: {
        findFirst: jest.fn().mockResolvedValue(returnRow),
      },
    }) as unknown as Parameters<typeof assertDoctorInDepartment>[0];

  it('passes when an active affiliation row exists', async () => {
    const tx = buildTx({ id: 'aff-1' });

    await expect(
      assertDoctorInDepartment(tx, 'doc', 'dept'),
    ).resolves.toBeUndefined();
  });

  it('throws 409 DOCTOR_NOT_IN_DEPARTMENT when no row is found', async () => {
    const tx = buildTx(null);

    try {
      await assertDoctorInDepartment(tx, 'doc', 'dept');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.DOCTOR_NOT_IN_DEPARTMENT);
      expect((err as AppException).getStatus()).toBe(409);
    }
  });
});

describe('assertNoOverlap', () => {
  const buildTx = (siblings: Array<Record<string, unknown>>) =>
    ({
      doctorSchedule: {
        findMany: jest.fn().mockResolvedValue(siblings),
      },
    }) as unknown as Parameters<typeof assertNoOverlap>[0];

  const candidate = {
    doctorId: 'doc',
    startAt: dt('2026-06-01T09:00:00Z'),
    endAt: dt('2026-06-01T12:00:00Z'),
  };

  it('passes when no siblings exist', async () => {
    await expect(
      assertNoOverlap(buildTx([]), candidate),
    ).resolves.toBeUndefined();
  });

  it('passes when sibling window is on a different day', async () => {
    await expect(
      assertNoOverlap(
        buildTx([
          {
            id: 'sib-1',
            startAt: dt('2026-06-02T09:00:00Z'),
            endAt: dt('2026-06-02T12:00:00Z'),
          },
        ]),
        candidate,
      ),
    ).resolves.toBeUndefined();
  });

  it('passes when sibling is back-to-back (half-open)', async () => {
    await expect(
      assertNoOverlap(
        buildTx([
          {
            id: 'sib-1',
            startAt: dt('2026-06-01T12:00:00Z'),
            endAt: dt('2026-06-01T14:00:00Z'),
          },
        ]),
        candidate,
      ),
    ).resolves.toBeUndefined();
  });

  it('throws SCHEDULE_OVERLAP when windows overlap', async () => {
    try {
      await assertNoOverlap(
        buildTx([
          {
            id: 'sib-overlap',
            startAt: dt('2026-06-01T10:00:00Z'),
            endAt: dt('2026-06-01T11:00:00Z'),
          },
        ]),
        candidate,
      );
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.SCHEDULE_OVERLAP);
      expect((err as AppException).details).toEqual({
        conflictingScheduleId: 'sib-overlap',
      });
    }
  });

  it('honors the excludeId so a row never collides with itself', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const tx = {
      doctorSchedule: { findMany },
    } as unknown as Parameters<typeof assertNoOverlap>[0];

    await assertNoOverlap(tx, candidate, 'self-id');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { id: 'self-id' },
        }),
      }),
    );
  });
});

describe('resolveListRange', () => {
  it('defaults to current calendar month when both omitted', () => {
    const now = new Date('2026-06-15T10:00:00Z');
    const { rangeStart, rangeEnd } = resolveListRange(undefined, undefined, now);

    expect(rangeStart.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-06-30T23:59:59.999Z');
  });

  it('handles a leap-February correctly', () => {
    const now = new Date('2028-02-10T00:00:00Z');
    const { rangeStart, rangeEnd } = resolveListRange(undefined, undefined, now);

    expect(rangeStart.toISOString()).toBe('2028-02-01T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2028-02-29T23:59:59.999Z');
  });

  it('expands provided from/to to UTC day bounds', () => {
    const { rangeStart, rangeEnd } = resolveListRange(
      '2026-07-04',
      '2026-07-04',
      new Date('2026-06-15T00:00:00Z'),
    );

    expect(rangeStart.toISOString()).toBe('2026-07-04T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-07-04T23:59:59.999Z');
  });

  it('falls back to start-of-month when only `to` is provided', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const { rangeStart, rangeEnd } = resolveListRange(undefined, '2026-06-20', now);

    expect(rangeStart.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-06-20T23:59:59.999Z');
  });

  it('falls back to end-of-month when only `from` is provided', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const { rangeStart, rangeEnd } = resolveListRange('2026-06-10', undefined, now);

    expect(rangeStart.toISOString()).toBe('2026-06-10T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-06-30T23:59:59.999Z');
  });
});

describe('SchedulesService (DI wiring smoke)', () => {
  it('constructs with a mock PrismaService', async () => {
    const module = await Test.createTestingModule({
      providers: [
        SchedulesService,
        {
          provide: PrismaService,
          useValue: {
            doctorSchedule: { findMany: jest.fn() },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    expect(module.get(SchedulesService)).toBeInstanceOf(SchedulesService);
  });
});
