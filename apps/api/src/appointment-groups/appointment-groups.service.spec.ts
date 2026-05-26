/**
 * Unit coverage for F14 `AppointmentGroupsService`.
 *
 * These tests exercise the scope-narrowing predicates using a
 * hand-rolled Prisma stub. The close() method was removed in F17;
 * group closure is now handled atomically by appointments.complete().
 * End-to-end behaviour lives in `test/appointment-groups.e2e-spec.ts`.
 */
import { AppointmentStatus, AppointmentType } from '@prisma/client';

import { PERMISSION } from '../auth/permissions';
import { ROLE } from '../auth/roles';
import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import { AppointmentGroupsService } from './appointment-groups.service';
import { APPOINTMENT_GROUP_STATUS } from './appointment-groups.const';

interface MockGroupRow {
  id: string;
  patientId: string;
  openedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  appointments: Array<{
    id: string;
    visitNumber: number | null;
    appointmentType: AppointmentType;
    status: AppointmentStatus;
    startAt: Date;
    endAt: Date;
    doctorId: string;
    departmentId: string;
    referredToDepartmentId: string | null;
    referredAt: Date | null;
    referralFulfilledByAppointmentId: string | null;
    department: { id: string; name: string };
    doctor: {
      id: string;
      doctorCode: string;
      user: { firstNameEn: string; lastNameEn: string };
    };
  }>;
}

const HOME_DEPT_ID = 'dept-home';
const FOREIGN_DEPT_ID = 'dept-foreign';
const DOC_HOME_ID = 'doctor-home';
const DOC_FOREIGN_ID = 'doctor-foreign';
const PATIENT_ID = 'patient-1';

const DOCTOR_USER: AuthenticatedUser = {
  id: 'user-doc-home',
  email: 'doc-home@example.com',
  roleId: 'role-doctor',
  roleCode: ROLE.DOCTOR,
  firstNameEn: 'Doc',
  lastNameEn: 'Home',
  firstNameTh: null,
  lastNameTh: null,
  picture: null,
  departmentId: HOME_DEPT_ID,
  permissionCodes: [
    PERMISSION.APPOINTMENT_READ_OWN,
    PERMISSION.APPOINTMENT_CREATE_OWN,
    PERMISSION.APPOINTMENT_UPDATE_OWN,
    PERMISSION.APPOINTMENT_DELETE_OWN,
  ],
  doctor: { id: DOC_HOME_ID, departmentId: HOME_DEPT_ID },
};

const NURSE_USER: AuthenticatedUser = {
  id: 'user-nurse',
  email: 'nurse@example.com',
  roleId: 'role-nurse',
  roleCode: ROLE.NURSE,
  firstNameEn: 'Nurse',
  lastNameEn: 'Home',
  firstNameTh: null,
  lastNameTh: null,
  picture: null,
  departmentId: HOME_DEPT_ID,
  permissionCodes: [
    PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_UPDATE_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_DELETE_OWN_DEPARTMENT,
  ],
  doctor: null,
};

function buildGroupRow(
  overrides: Partial<MockGroupRow> = {},
  appointmentOverrides: Array<
    Partial<MockGroupRow['appointments'][number]>
  > = [],
): MockGroupRow {
  const baseAppointment = {
    id: 'appt-1',
    visitNumber: 1,
    appointmentType: AppointmentType.CONSULTATION,
    status: AppointmentStatus.COMPLETED,
    startAt: new Date('2026-06-01T09:00:00.000Z'),
    endAt: new Date('2026-06-01T09:20:00.000Z'),
    doctorId: DOC_HOME_ID,
    departmentId: HOME_DEPT_ID,
    referredToDepartmentId: null,
    referredAt: null,
    referralFulfilledByAppointmentId: null,
    department: { id: HOME_DEPT_ID, name: 'Home' },
    doctor: {
      id: DOC_HOME_ID,
      doctorCode: 'MD-0001',
      user: { firstNameEn: 'Doc', lastNameEn: 'Home' },
    },
  };

  return {
    id: 'group-1',
    patientId: PATIENT_ID,
    openedAt: new Date('2026-06-01T09:00:00.000Z'),
    closedAt: null,
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    updatedAt: new Date('2026-06-01T09:00:00.000Z'),
    appointments:
      appointmentOverrides.length > 0
        ? appointmentOverrides.map((o) => ({ ...baseAppointment, ...o }))
        : [baseAppointment],
    ...overrides,
  };
}

function buildPrismaMock(opts: {
  findFirst?: (args: unknown) => Promise<MockGroupRow | null>;
  findMany?: () => Promise<Array<{ id: string }>>;
  count?: () => Promise<number>;
  findUniqueOrThrow?: () => Promise<MockGroupRow>;
  appointmentCount?: () => Promise<number>;
  appointmentFindFirst?: () => Promise<MockGroupRow['appointments'][number] | null>;
  appointmentUpdate?: () => Promise<unknown>;
  groupUpdate?: () => Promise<unknown>;
  groupFindFirstOrThrow?: () => Promise<MockGroupRow>;
}): PrismaService {
  const prisma = {
    appointmentGroup: {
      findFirst: opts.findFirst ?? (async () => null),
      findMany: opts.findMany ?? (async () => []),
      count: opts.count ?? (async () => 0),
      findUniqueOrThrow:
        opts.findUniqueOrThrow ?? (async () => buildGroupRow()),
      update: opts.groupUpdate ?? (async () => ({})),
      findFirstOrThrow:
        opts.groupFindFirstOrThrow ?? (async () => buildGroupRow()),
    },
    appointment: {
      count: opts.appointmentCount ?? (async () => 0),
      findFirst: opts.appointmentFindFirst ?? (async () => null),
      update: opts.appointmentUpdate ?? (async () => ({})),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(prisma);
    },
  } as unknown as PrismaService;

  return prisma;
}

describe('AppointmentGroupsService.getById', () => {
  it('returns the group when the caller scope intersects', async () => {
    const row = buildGroupRow();

    const prisma = buildPrismaMock({ findFirst: async () => row });
    const service = new AppointmentGroupsService(prisma);

    const result = await service.getById(DOCTOR_USER, 'group-1');

    expect(result.id).toBe('group-1');
    expect(result.members).toHaveLength(1);
    expect(result.members[0].visitNumber).toBe(1);
  });

  it('returns 404 when the row is missing', async () => {
    const prisma = buildPrismaMock({ findFirst: async () => null });
    const service = new AppointmentGroupsService(prisma);

    try {
      await service.getById(DOCTOR_USER, 'group-missing');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.APPOINTMENT_GROUP_NOT_FOUND,
      );
      expect((err as AppException).getStatus()).toBe(404);
    }
  });

  it('returns 404 when no member intersects DOCTOR.own scope', async () => {
    const row = buildGroupRow({}, [{ doctorId: DOC_FOREIGN_ID }]);
    const prisma = buildPrismaMock({ findFirst: async () => row });
    const service = new AppointmentGroupsService(prisma);

    try {
      await service.getById(DOCTOR_USER, 'group-1');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.APPOINTMENT_GROUP_NOT_FOUND,
      );
    }
  });

  it('returns the group when at least one member is in the caller dept (NURSE.own-department)', async () => {
    const row = buildGroupRow({}, [
      { id: 'appt-foreign', doctorId: DOC_FOREIGN_ID, departmentId: FOREIGN_DEPT_ID },
      { id: 'appt-home', doctorId: DOC_HOME_ID, departmentId: HOME_DEPT_ID },
    ]);
    const prisma = buildPrismaMock({ findFirst: async () => row });
    const service = new AppointmentGroupsService(prisma);

    const result = await service.getById(NURSE_USER, 'group-1');

    expect(result.id).toBe('group-1');
    expect(result.members).toHaveLength(2);
  });

  it('serialises members in chronological order from the DB layer', async () => {
    // The DB layer orders by `startAt ASC, visitNumber ASC` — the
    // service simply maps. Provide two members in chronological order
    // and confirm `visitNumber` lands as-is.
    const row = buildGroupRow({}, [
      {
        id: 'appt-1',
        visitNumber: 1,
        startAt: new Date('2026-06-01T09:00:00.000Z'),
      },
      {
        id: 'appt-2',
        visitNumber: 2,
        startAt: new Date('2026-06-02T09:00:00.000Z'),
      },
    ]);
    const prisma = buildPrismaMock({ findFirst: async () => row });
    const service = new AppointmentGroupsService(prisma);

    const result = await service.getById(DOCTOR_USER, 'group-1');

    expect(result.members.map((m) => m.visitNumber)).toEqual([1, 2]);
    expect(result.members.map((m) => m.id)).toEqual(['appt-1', 'appt-2']);
  });
});

describe('AppointmentGroupsService.list', () => {
  it('forwards `status=open` to a `closedAt IS NULL` filter', async () => {
    const findManySpy = jest.fn(async () => [{ id: 'group-1' }]);
    const countSpy = jest.fn(async () => 1);
    const prisma = buildPrismaMock({
      findMany: findManySpy as unknown as () => Promise<Array<{ id: string }>>,
      count: countSpy as unknown as () => Promise<number>,
      findUniqueOrThrow: async () => buildGroupRow(),
      appointmentCount: async () => 1,
      appointmentFindFirst: async () => ({
        id: 'appt-1',
        visitNumber: 1,
        appointmentType: AppointmentType.CONSULTATION,
        status: AppointmentStatus.BOOKED,
        startAt: new Date('2026-06-01T09:00:00.000Z'),
        endAt: new Date('2026-06-01T09:20:00.000Z'),
        doctorId: DOC_HOME_ID,
        departmentId: HOME_DEPT_ID,
        referredToDepartmentId: null,
        referredAt: null,
        referralFulfilledByAppointmentId: null,
        department: { id: HOME_DEPT_ID, name: 'Home' },
        doctor: {
          id: DOC_HOME_ID,
          doctorCode: 'MD-0001',
          user: { firstNameEn: 'Doc', lastNameEn: 'Home' },
        },
      }),
    });
    const service = new AppointmentGroupsService(prisma);

    const res = await service.list(DOCTOR_USER, {
      patientId: PATIENT_ID,
      status: APPOINTMENT_GROUP_STATUS.OPEN,
    });

    expect(res.data).toHaveLength(1);
    expect(res.total).toBe(1);

    const firstFindManyArgs = (findManySpy.mock.calls[0] as unknown as [unknown])[0] as {
      where: { closedAt: unknown };
    };

    expect(firstFindManyArgs.where.closedAt).toBeNull();
  });

  it('forwards `status=closed` to a `closedAt IS NOT NULL` filter', async () => {
    const findManySpy = jest.fn(async () => []);
    const countSpy = jest.fn(async () => 0);
    const prisma = buildPrismaMock({
      findMany: findManySpy as unknown as () => Promise<Array<{ id: string }>>,
      count: countSpy as unknown as () => Promise<number>,
    });
    const service = new AppointmentGroupsService(prisma);

    const res = await service.list(DOCTOR_USER, {
      patientId: PATIENT_ID,
      status: APPOINTMENT_GROUP_STATUS.CLOSED,
    });

    expect(res.data).toHaveLength(0);

    const firstFindManyArgs = (findManySpy.mock.calls[0] as unknown as [unknown])[0] as {
      where: { closedAt: unknown };
    };

    expect(firstFindManyArgs.where.closedAt).toEqual({ not: null });
  });

  it('omits the closedAt filter when `status=all`', async () => {
    const findManySpy = jest.fn(async () => []);
    const countSpy = jest.fn(async () => 0);
    const prisma = buildPrismaMock({
      findMany: findManySpy as unknown as () => Promise<Array<{ id: string }>>,
      count: countSpy as unknown as () => Promise<number>,
    });
    const service = new AppointmentGroupsService(prisma);

    await service.list(DOCTOR_USER, {
      patientId: PATIENT_ID,
      status: APPOINTMENT_GROUP_STATUS.ALL,
    });

    const firstFindManyArgs = (findManySpy.mock.calls[0] as unknown as [unknown])[0] as {
      where: { closedAt?: unknown };
    };

    expect(firstFindManyArgs.where.closedAt).toBeUndefined();
  });
});

