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
import { SCHEDULE_VERB } from './schedule.scope.const';
import {
  assertDoctorInDepartment,
  assertNoOverlap,
  assertStartAtNotInPast,
  overlapsWindow,
} from './schedule.validation';
import { SchedulesService, resolveListRange } from './schedules.service';

const NURSE_USER: AuthenticatedUser = {
  id: 'user-nurse',
  email: 'nurse@example.com',
  roleId: 'role-nurse',
  roleCode: ROLE.NURSE,
  firstNameEn: 'Nurse',
  lastNameEn: 'One',
  firstNameTh: null,
  lastNameTh: null,
  picture: null,
  departmentId: 'dept-nurse',
  permissionCodes: [
    'schedule.create.own-department',
    'schedule.read.own-department',
    'schedule.update.own-department',
    'schedule.delete.own-department',
  ],
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
  departmentId: 'dept-doctor',
  permissionCodes: [
    'schedule.create.own',
    'schedule.read.own',
    'schedule.update.own',
    'schedule.delete.own',
  ],
  doctor: { id: 'doctor-own', departmentId: 'dept-doctor' },
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
    expect(isDoctorScoped(NURSE_USER)).toBe(false);
    expect(isDoctorScoped(DOCTOR_USER)).toBe(true);
  });

  it('getScopedDoctorId returns null for NURSE and the linked id for DOCTOR', () => {
    expect(getScopedDoctorId(NURSE_USER)).toBeNull();
    expect(getScopedDoctorId(DOCTOR_USER)).toBe('doctor-own');
  });

  it('getScopedDoctorId throws if a DOCTOR has no linked Doctor row', () => {
    expect(() =>
      getScopedDoctorId({ ...DOCTOR_USER, doctor: null }),
    ).toThrow(AppException);
  });

  it('assertCanActOnDoctor passes for NURSE on a doctor in the same department', () => {
    expect(() =>
      assertCanActOnDoctor(NURSE_USER, SCHEDULE_VERB.CREATE, 'any-doctor', 'dept-nurse'),
    ).not.toThrow();
  });

  it('assertCanActOnDoctor throws INSUFFICIENT_PERMISSION_SCOPE for NURSE on a doctor in a foreign department', () => {
    try {
      assertCanActOnDoctor(NURSE_USER, SCHEDULE_VERB.CREATE, 'any-doctor', 'dept-other');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      );
      expect((err as AppException).getStatus()).toBe(403);
    }
  });

  it('assertCanActOnDoctor passes for DOCTOR on own id', () => {
    expect(() =>
      assertCanActOnDoctor(DOCTOR_USER, SCHEDULE_VERB.CREATE, 'doctor-own', 'dept-doctor'),
    ).not.toThrow();
  });

  it('assertCanActOnDoctor throws INSUFFICIENT_PERMISSION_SCOPE for DOCTOR on foreign id', () => {
    try {
      assertCanActOnDoctor(DOCTOR_USER, SCHEDULE_VERB.CREATE, 'doctor-other', 'dept-doctor');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      );
      expect((err as AppException).getStatus()).toBe(403);
    }
  });

  it('assertCanActOnDoctor (CREATE) rejects a DOCTOR who only holds schedule.read.own-department for a foreign doctor in their dept — the read scope MUST NOT widen create authority', () => {
    // DOCTOR holds `schedule.read.own-department` (for cross-coverage
    // visibility) AND `schedule.create.own` (write). The pre-Item-1 widest-
    // scope resolver would have returned OWN_DEPARTMENT for the write —
    // letting the doctor create schedules for ANY doctor in the dept. The
    // per-verb fix rejects this case.
    const DOCTOR_WITH_DEPT_READ_SCOPE: typeof DOCTOR_USER = {
      ...DOCTOR_USER,
      permissionCodes: [
        ...DOCTOR_USER.permissionCodes,
        'schedule.read.own-department',
      ],
    };

    try {
      assertCanActOnDoctor(
        DOCTOR_WITH_DEPT_READ_SCOPE,
        SCHEDULE_VERB.CREATE,
        'doctor-other',
        'dept-doctor',
      );
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      );
      expect((err as AppException).details).toEqual(
        expect.objectContaining({
          required: ['schedule.create.own-department'],
          scope: 'own',
          requestedDoctorId: 'doctor-other',
          ownDoctorId: 'doctor-own',
        }),
      );
    }
  });
});

describe('assertDoctorInDepartment', () => {
  // Post-Item-3 the lookup reads `doctor.user.departmentId` (Doctor no
  // longer carries a `department_id` column). The mock therefore returns
  // `{ user: { departmentId } }` instead of a flat `{ departmentId }`.
  const buildTx = (returnRow: { user: { departmentId: string } } | null) =>
    ({
      doctor: {
        findFirst: jest.fn().mockResolvedValue(returnRow),
      },
    }) as unknown as Parameters<typeof assertDoctorInDepartment>[0];

  it('passes when the doctor row exists AND user.departmentId matches', async () => {
    const tx = buildTx({ user: { departmentId: 'dept' } });

    await expect(
      assertDoctorInDepartment(tx, 'doc', 'dept'),
    ).resolves.toBeUndefined();
  });

  it('throws 409 DOCTOR_NOT_IN_DEPARTMENT when the doctor is missing', async () => {
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

  it('throws 400 DOCTOR_DEPARTMENT_MISMATCH when the doctor’s user.departmentId differs', async () => {
    const tx = buildTx({ user: { departmentId: 'dept-other' } });

    try {
      await assertDoctorInDepartment(tx, 'doc', 'dept');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.DOCTOR_DEPARTMENT_MISMATCH);
      expect((err as AppException).getStatus()).toBe(400);
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

describe('SchedulesService — SCHEDULE_HAS_APPOINTMENTS guard', () => {
  const NOW = new Date('2026-06-15T12:00:00.000Z');

  // Stamp the existing row's startAt into the future so the
  // past-startAt guard never fires before the appointment guard.
  const FUTURE_EXISTING = {
    id: 'sched-1',
    doctorId: 'doctor-own',
    departmentId: 'dept-doctor',
    startAt: new Date('2026-06-20T09:00:00.000Z'),
    endAt: new Date('2026-06-20T12:00:00.000Z'),
    breakStartAt: null,
    breakEndAt: null,
    acceptsBooking: true,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const buildService = (
    appointmentCount: number,
  ): { service: SchedulesService; appointmentCountMock: jest.Mock; scheduleUpdateMock: jest.Mock } => {
    const appointmentCountMock = jest.fn().mockResolvedValue(appointmentCount);
    const scheduleUpdateMock = jest.fn().mockResolvedValue({
      ...FUTURE_EXISTING,
      acceptsBooking: false,
      doctor: {
        id: 'doctor-own',
        doctorCode: 'D-1',
        user: {
          firstNameEn: 'Doc',
          lastNameEn: 'Own',
          firstNameTh: null,
          lastNameTh: null,
        },
      },
      department: {
        id: 'dept-doctor',
        name: 'Dept',
        description: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const prisma = {
      doctorSchedule: {
        findFirst: jest.fn().mockResolvedValue(FUTURE_EXISTING),
        update: scheduleUpdateMock,
      },
      appointment: {
        count: appointmentCountMock,
      },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        // Minimal tx mock — the assertNoOverlap call inside update()
        // accepts the same shape. We only need it to resolve cleanly so
        // the path that DOES reach the update is exercised.
        return cb({
          doctor: {
            findFirst: jest.fn().mockResolvedValue({ user: { departmentId: 'dept-doctor' } }),
          },
          doctorSchedule: {
            findMany: jest.fn().mockResolvedValue([]),
            update: scheduleUpdateMock,
          },
        });
      }),
    } as unknown as PrismaService;

    return {
      service: new SchedulesService(prisma),
      appointmentCountMock,
      scheduleUpdateMock,
    };
  };

  // update() ----------------------------------------------------------------

  it('update — 0 appointments → does NOT throw and proceeds to mutation', async () => {
    const { service, appointmentCountMock, scheduleUpdateMock } = buildService(0);

    await expect(
      service.update(DOCTOR_USER, FUTURE_EXISTING.id, { acceptsBooking: false }),
    ).resolves.toBeDefined();

    expect(appointmentCountMock).toHaveBeenCalledWith({
      where: {
        scheduleId: FUTURE_EXISTING.id,
        status: { in: ['BOOKED', 'COMPLETED'] },
      },
    });
    expect(scheduleUpdateMock).toHaveBeenCalled();
  });

  it('update — 1 BOOKED appointment → throws SCHEDULE_HAS_APPOINTMENTS (409)', async () => {
    const { service, scheduleUpdateMock } = buildService(1);

    try {
      await service.update(DOCTOR_USER, FUTURE_EXISTING.id, { acceptsBooking: false });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.SCHEDULE_HAS_APPOINTMENTS);
      expect((err as AppException).getStatus()).toBe(409);
      expect((err as AppException).details).toEqual({
        scheduleId: FUTURE_EXISTING.id,
        blockingAppointmentCount: 1,
      });
    }

    expect(scheduleUpdateMock).not.toHaveBeenCalled();
  });

  it('update — only CANCELLED appointments (count returns 0) → succeeds', async () => {
    // The guard only counts BOOKED + COMPLETED — CANCELLED rows are not
    // matched by the `where` filter. The mock therefore models the BE
    // returning 0 even when CANCELLED rows exist.
    const { service, appointmentCountMock, scheduleUpdateMock } = buildService(0);

    await expect(
      service.update(DOCTOR_USER, FUTURE_EXISTING.id, { acceptsBooking: false }),
    ).resolves.toBeDefined();

    expect(appointmentCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['BOOKED', 'COMPLETED'] },
        }),
      }),
    );
    expect(scheduleUpdateMock).toHaveBeenCalled();
  });

  // softDelete() ------------------------------------------------------------

  it('softDelete — 0 appointments → soft-deletes the row', async () => {
    const { service, appointmentCountMock, scheduleUpdateMock } = buildService(0);

    await expect(
      service.softDelete(DOCTOR_USER, FUTURE_EXISTING.id),
    ).resolves.toBeUndefined();

    expect(appointmentCountMock).toHaveBeenCalledWith({
      where: {
        scheduleId: FUTURE_EXISTING.id,
        status: { in: ['BOOKED', 'COMPLETED'] },
      },
    });
    expect(scheduleUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FUTURE_EXISTING.id },
        data: expect.objectContaining({ deletedBy: DOCTOR_USER.id }),
      }),
    );
  });

  it('softDelete — 1 BOOKED appointment → throws SCHEDULE_HAS_APPOINTMENTS (409)', async () => {
    const { service, scheduleUpdateMock } = buildService(1);

    try {
      await service.softDelete(DOCTOR_USER, FUTURE_EXISTING.id);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.SCHEDULE_HAS_APPOINTMENTS);
      expect((err as AppException).getStatus()).toBe(409);
      expect((err as AppException).details).toEqual({
        scheduleId: FUTURE_EXISTING.id,
        blockingAppointmentCount: 1,
      });
    }

    expect(scheduleUpdateMock).not.toHaveBeenCalled();
  });

  it('softDelete — only CANCELLED appointments (count returns 0) → succeeds', async () => {
    const { service, scheduleUpdateMock } = buildService(0);

    await expect(
      service.softDelete(DOCTOR_USER, FUTURE_EXISTING.id),
    ).resolves.toBeUndefined();

    expect(scheduleUpdateMock).toHaveBeenCalled();
  });
});
