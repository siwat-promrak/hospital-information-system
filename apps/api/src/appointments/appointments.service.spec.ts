/**
 * Unit coverage for the F14 additions to `AppointmentsService` —
 * `complete()` and `refer()`. Both are exercised with hand-rolled
 * Prisma stubs since they sit outside the `$transaction` envelope used
 * for booking. Full end-to-end coverage (real DB, lazy-group flow)
 * lives in `test/appointments.e2e-spec.ts` +
 * `test/appointment-groups.e2e-spec.ts`.
 */
import { AppointmentStatus, AppointmentType } from '@prisma/client';

import { PERMISSION } from '../auth/permissions';
import { ROLE } from '../auth/roles';
import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import { AppointmentsService } from './appointments.service';

const HOME_DEPT_ID = 'dept-home';
const FOREIGN_DEPT_ID = 'dept-foreign';
const DOC_HOME_ID = 'doctor-home';
const DOC_FOREIGN_ID = 'doctor-foreign';
const APPT_ID = 'appt-1';

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
  id: 'user-nurse-home',
  email: 'nurse-home@example.com',
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

interface MockApptRow {
  id: string;
  patientId: string;
  doctorId: string;
  departmentId: string;
  scheduleId: string;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  appointmentGroupId: string | null;
  visitNumber: number | null;
  referredToDepartmentId: string | null;
  referredAt: Date | null;
  referralFulfilledByAppointmentId: string | null;
  patient: {
    id: string;
    hn: string;
    firstNameEn: string;
    lastNameEn: string;
    firstNameTh: string | null;
    lastNameTh: string | null;
  };
  doctor: {
    id: string;
    doctorCode: string;
    user: { firstNameEn: string; lastNameEn: string };
  };
  department: { id: string; name: string };
}

function baseRow(overrides: Partial<MockApptRow> = {}): MockApptRow {
  return {
    id: APPT_ID,
    patientId: 'patient-1',
    doctorId: DOC_HOME_ID,
    departmentId: HOME_DEPT_ID,
    scheduleId: 'sched-1',
    appointmentType: AppointmentType.CONSULTATION,
    status: AppointmentStatus.BOOKED,
    startAt: new Date('2026-06-01T09:00:00.000Z'),
    endAt: new Date('2026-06-01T09:20:00.000Z'),
    reason: null,
    cancelledAt: null,
    cancellationReason: null,
    cancelledBy: null,
    createdBy: 'user-doc-home',
    createdAt: new Date('2026-05-01T08:00:00.000Z'),
    updatedAt: new Date('2026-05-01T08:00:00.000Z'),
    appointmentGroupId: null,
    visitNumber: null,
    referredToDepartmentId: null,
    referredAt: null,
    referralFulfilledByAppointmentId: null,
    patient: {
      id: 'patient-1',
      hn: '000001234',
      firstNameEn: 'Praewa',
      lastNameEn: 'Boonmee',
      firstNameTh: null,
      lastNameTh: null,
    },
    doctor: {
      id: DOC_HOME_ID,
      doctorCode: 'MD-0001',
      user: { firstNameEn: 'Doc', lastNameEn: 'Home' },
    },
    department: { id: HOME_DEPT_ID, name: 'Home' },
    ...overrides,
  };
}

describe('AppointmentsService.complete', () => {
  it('rejects when caller is not the doctor on the appointment', async () => {
    const prisma = {
      appointment: {
        findFirst: async () =>
          baseRow({ doctorId: DOC_FOREIGN_ID, departmentId: FOREIGN_DEPT_ID }),
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    try {
      await service.complete(DOCTOR_USER, APPT_ID);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      );
    }
  });

  it('rejects from CANCELLED with 409 APPOINTMENT_NOT_BOOKED', async () => {
    const prisma = {
      appointment: {
        findFirst: async () =>
          baseRow({ status: AppointmentStatus.CANCELLED }),
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    try {
      await service.complete(DOCTOR_USER, APPT_ID);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.APPOINTMENT_NOT_BOOKED);
      expect((err as AppException).getStatus()).toBe(409);
    }
  });

  it('is idempotent on COMPLETED — returns the existing row without writing', async () => {
    const completedRow = baseRow({ status: AppointmentStatus.COMPLETED });
    const updateSpy = jest.fn(async () => completedRow);

    const prisma = {
      appointment: {
        findFirst: async () => completedRow,
        findFirstOrThrow: async () => completedRow,
        update: updateSpy,
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    const result = await service.complete(DOCTOR_USER, APPT_ID);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(result.status).toBe(AppointmentStatus.COMPLETED);
  });

  it('transitions BOOKED → COMPLETED and stamps completedAt + updatedBy', async () => {
    const bookedRow = baseRow();
    const updatedRow = baseRow({
      status: AppointmentStatus.COMPLETED,
    });
    const updateSpy = jest.fn(async () => updatedRow);

    const prisma = {
      appointment: {
        findFirst: async () => bookedRow,
        update: updateSpy,
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    const result = await service.complete(DOCTOR_USER, APPT_ID);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(AppointmentStatus.COMPLETED);

    const callArgs = (updateSpy.mock.calls[0] as unknown as [unknown])[0] as {
      data: { status: AppointmentStatus; completedAt: Date; updatedBy: string };
    };

    expect(callArgs.data.status).toBe(AppointmentStatus.COMPLETED);
    expect(callArgs.data.completedAt).toBeInstanceOf(Date);
    expect(callArgs.data.updatedBy).toBe(DOCTOR_USER.id);
  });

  it('returns 404 APPOINTMENT_NOT_FOUND when the row is missing', async () => {
    const prisma = {
      appointment: {
        findFirst: async () => null,
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    try {
      await service.complete(DOCTOR_USER, 'missing-appt');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.APPOINTMENT_NOT_FOUND);
    }
  });

  it('allows NURSE in same department on own-department scope', async () => {
    const bookedRow = baseRow();
    const updateSpy = jest.fn(async () =>
      baseRow({ status: AppointmentStatus.COMPLETED }),
    );

    const prisma = {
      appointment: {
        findFirst: async () => bookedRow,
        update: updateSpy,
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    const result = await service.complete(NURSE_USER, APPT_ID);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(AppointmentStatus.COMPLETED);
  });
});

describe('AppointmentsService.refer', () => {
  it('rejects with APPOINTMENT_ALREADY_REFERRED on a second refer attempt', async () => {
    const referredRow = baseRow({
      referredToDepartmentId: FOREIGN_DEPT_ID,
      referredAt: new Date('2026-06-01T10:00:00.000Z'),
    });

    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          appointment: {
            findFirst: async () => referredRow,
          },
        });
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    try {
      await service.refer(DOCTOR_USER, APPT_ID, {
        toDepartmentId: FOREIGN_DEPT_ID,
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.APPOINTMENT_ALREADY_REFERRED,
      );
      expect((err as AppException).getStatus()).toBe(409);
    }
  });

  it('rejects when caller is not the doctor on the row', async () => {
    const foreignRow = baseRow({
      doctorId: DOC_FOREIGN_ID,
      departmentId: FOREIGN_DEPT_ID,
    });

    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          appointment: {
            findFirst: async () => foreignRow,
          },
        });
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    try {
      await service.refer(DOCTOR_USER, APPT_ID, {
        toDepartmentId: FOREIGN_DEPT_ID,
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      );
    }
  });

  it('returns 400 when destination department is unknown', async () => {
    const bookedRow = baseRow();

    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          appointment: {
            findFirst: async () => bookedRow,
          },
          department: {
            findFirst: async () => null,
          },
        });
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    try {
      await service.refer(DOCTOR_USER, APPT_ID, {
        toDepartmentId: 'dept-missing',
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.NOT_FOUND);
      expect((err as AppException).getStatus()).toBe(400);
    }
  });

  it('atomically sets status=COMPLETED + referredToDepartmentId + referredAt', async () => {
    const bookedRow = baseRow();
    const updatedRow = baseRow({
      status: AppointmentStatus.COMPLETED,
      referredToDepartmentId: FOREIGN_DEPT_ID,
      referredAt: new Date('2026-06-01T10:00:00.000Z'),
    });
    const updateSpy = jest.fn(async () => updatedRow);

    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          appointment: {
            findFirst: async () => bookedRow,
            update: updateSpy,
          },
          department: {
            findFirst: async () => ({ id: FOREIGN_DEPT_ID }),
          },
        });
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    const result = await service.refer(DOCTOR_USER, APPT_ID, {
      toDepartmentId: FOREIGN_DEPT_ID,
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(AppointmentStatus.COMPLETED);
    expect(result.referredToDepartmentId).toBe(FOREIGN_DEPT_ID);
    expect(result.referredAt).not.toBeNull();

    const callArgs = (updateSpy.mock.calls[0] as unknown as [unknown])[0] as {
      data: {
        status: AppointmentStatus;
        referredToDepartmentId: string;
        referredAt: Date;
      };
    };

    expect(callArgs.data.status).toBe(AppointmentStatus.COMPLETED);
    expect(callArgs.data.referredToDepartmentId).toBe(FOREIGN_DEPT_ID);
  });
});

/**
 * Coverage for F14 — Rule 1 (prev must be COMPLETED with group still
 * open) + Rule 2 (continuation visits must be FOLLOW_UP or PROCEDURE).
 *
 * The booking transaction is heavy on collaborators — `tx` exposes the
 * department-type lookup, doctor + patient + schedule fetches, slot
 * collision query, group-resolution, and the final insert. Each test
 * stubs only the pieces it touches and lets the rest no-op.
 */
describe('AppointmentsService.create — continuation validation', () => {
  const PATIENT_ID = 'patient-1';
  const SCHEDULE_ID = 'sched-1';
  const PREV_APPT_ID = 'prev-1';

  // Far future so the past-startAt guard doesn't fire.
  const SLOT_START = '2097-12-01T10:00:00.000Z';
  const SCHEDULE_START = new Date('2097-12-01T09:00:00.000Z');
  const SCHEDULE_END = new Date('2097-12-01T18:00:00.000Z');

  interface PrevRow {
    id: string;
    patientId: string;
    departmentId: string;
    status: AppointmentStatus;
    appointmentGroupId: string | null;
    visitNumber: number | null;
    referredToDepartmentId: string | null;
    referralFulfilledByAppointmentId: string | null;
  }

  function buildPrismaMock(opts: {
    prev: PrevRow | null;
    onCreate?: jest.Mock;
  }): PrismaService {
    const createSpy =
      opts.onCreate ??
      jest.fn(async () =>
        baseRow({
          status: AppointmentStatus.BOOKED,
          appointmentGroupId: 'group-new',
          visitNumber: 2,
        }),
      );

    return {
      $transaction: async (
        fn: (tx: unknown) => Promise<unknown>,
        _options?: unknown,
      ) => {
        const tx = {
          appointment: {
            findFirst: async (args: {
              where: { id?: string };
            }): Promise<PrevRow | null> => {
              if (args.where.id === PREV_APPT_ID) {
                return opts.prev;
              }

              return null;
            },
            // Stubbed empty — no concurrent bookings on the doctor's
            // schedule for these continuation-validation tests. Powers
            // both the SLOT_TAKEN race check and the SLOT_NOT_ON_GRID
            // grid-alignment check (no blockers ⇒ single free interval
            // [scheduleStart, scheduleEnd) so the standard 09:00-anchored
            // grid surfaces SLOT_START = 10:00 with a 20-min step).
            findMany: async () => [],
            aggregate: async () => ({ _max: { visitNumber: 1 } }),
            create: createSpy,
            update: async () => baseRow(),
          },
          appointmentGroup: {
            findFirst: async () => ({ id: 'group-1', closedAt: null }),
            create: async () => ({ id: 'group-new' }),
          },
          departmentAppointmentType: {
            findFirst: async () => ({
              id: 'dat-1',
              durationMinutes: 20,
              bookingWindowStartMinute: null,
              bookingWindowEndMinute: null,
            }),
          },
          doctor: {
            findFirst: async () => ({
              id: DOC_HOME_ID,
              user: { departmentId: HOME_DEPT_ID },
            }),
          },
          patient: {
            findFirst: async () => ({ id: PATIENT_ID }),
          },
          doctorSchedule: {
            findFirst: async () => ({
              id: SCHEDULE_ID,
              startAt: SCHEDULE_START,
              endAt: SCHEDULE_END,
              breakStartAt: null,
              breakEndAt: null,
              acceptsBooking: true,
            }),
          },
        };

        return fn(tx);
      },
    } as unknown as PrismaService;
  }

  it('accepts a FOLLOW_UP continuation from a COMPLETED prev', async () => {
    const createSpy = jest.fn(async () =>
      baseRow({
        status: AppointmentStatus.BOOKED,
        appointmentGroupId: 'group-new',
        visitNumber: 2,
      }),
    );

    const prisma = buildPrismaMock({
      prev: {
        id: PREV_APPT_ID,
        patientId: PATIENT_ID,
        departmentId: HOME_DEPT_ID,
        status: AppointmentStatus.COMPLETED,
        appointmentGroupId: null,
        visitNumber: null,
        referredToDepartmentId: null,
        referralFulfilledByAppointmentId: null,
      },
      onCreate: createSpy,
    });
    const service = new AppointmentsService(prisma);

    const result = await service.create(DOCTOR_USER, {
      patientId: PATIENT_ID,
      doctorId: DOC_HOME_ID,
      departmentId: HOME_DEPT_ID,
      scheduleId: SCHEDULE_ID,
      appointmentType: AppointmentType.FOLLOW_UP,
      startAt: SLOT_START,
      previousAppointmentId: PREV_APPT_ID,
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(result.appointmentGroupId).toBe('group-new');
    expect(result.visitNumber).toBe(2);
  });

  it('rejects a continuation from a BOOKED prev with PREVIOUS_APPOINTMENT_NOT_COMPLETED', async () => {
    const prisma = buildPrismaMock({
      prev: {
        id: PREV_APPT_ID,
        patientId: PATIENT_ID,
        departmentId: HOME_DEPT_ID,
        status: AppointmentStatus.BOOKED,
        appointmentGroupId: null,
        visitNumber: null,
        referredToDepartmentId: null,
        referralFulfilledByAppointmentId: null,
      },
    });
    const service = new AppointmentsService(prisma);

    try {
      await service.create(DOCTOR_USER, {
        patientId: PATIENT_ID,
        doctorId: DOC_HOME_ID,
        departmentId: HOME_DEPT_ID,
        scheduleId: SCHEDULE_ID,
        appointmentType: AppointmentType.FOLLOW_UP,
        startAt: SLOT_START,
        previousAppointmentId: PREV_APPT_ID,
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.PREVIOUS_APPOINTMENT_NOT_COMPLETED,
      );
      expect((err as AppException).getStatus()).toBe(400);
    }
  });

  it('rejects a NEW_PATIENT_VISIT continuation with CONTINUATION_APPOINTMENT_TYPE_INVALID', async () => {
    const prisma = buildPrismaMock({
      prev: {
        id: PREV_APPT_ID,
        patientId: PATIENT_ID,
        departmentId: HOME_DEPT_ID,
        status: AppointmentStatus.COMPLETED,
        appointmentGroupId: null,
        visitNumber: null,
        referredToDepartmentId: null,
        referralFulfilledByAppointmentId: null,
      },
    });
    const service = new AppointmentsService(prisma);

    try {
      await service.create(DOCTOR_USER, {
        patientId: PATIENT_ID,
        doctorId: DOC_HOME_ID,
        departmentId: HOME_DEPT_ID,
        scheduleId: SCHEDULE_ID,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: SLOT_START,
        previousAppointmentId: PREV_APPT_ID,
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.CONTINUATION_APPOINTMENT_TYPE_INVALID,
      );
      expect((err as AppException).getStatus()).toBe(400);
      expect((err as AppException).details?.allowedAppointmentTypes).toEqual(
        expect.arrayContaining([
          AppointmentType.FOLLOW_UP,
          AppointmentType.PROCEDURE,
        ]),
      );
    }
  });

  it('rejects a CONSULTATION continuation with CONTINUATION_APPOINTMENT_TYPE_INVALID', async () => {
    const prisma = buildPrismaMock({
      prev: {
        id: PREV_APPT_ID,
        patientId: PATIENT_ID,
        departmentId: HOME_DEPT_ID,
        status: AppointmentStatus.COMPLETED,
        appointmentGroupId: null,
        visitNumber: null,
        referredToDepartmentId: null,
        referralFulfilledByAppointmentId: null,
      },
    });
    const service = new AppointmentsService(prisma);

    try {
      await service.create(DOCTOR_USER, {
        patientId: PATIENT_ID,
        doctorId: DOC_HOME_ID,
        departmentId: HOME_DEPT_ID,
        scheduleId: SCHEDULE_ID,
        appointmentType: AppointmentType.CONSULTATION,
        startAt: SLOT_START,
        previousAppointmentId: PREV_APPT_ID,
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.CONTINUATION_APPOINTMENT_TYPE_INVALID,
      );
      expect((err as AppException).getStatus()).toBe(400);
    }
  });
});
