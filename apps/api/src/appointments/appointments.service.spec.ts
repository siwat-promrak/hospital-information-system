/**
 * Unit coverage for the F14/F18 additions to `AppointmentsService` —
 * `complete()`, `refer()`. Both are exercised with hand-rolled
 * Prisma stubs. Full end-to-end coverage (real DB, lazy-group flow)
 * lives in `test/appointments.e2e-spec.ts` +
 * `test/appointment-groups.e2e-spec.ts`.
 */
import { AppointmentStatus, AppointmentType } from '@prisma/client';

import { PERMISSION } from '../auth/permissions';
import { ROLE } from '../auth/roles';
import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import type { MedicalRecordsService } from '../medical-records/medical-records.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import { AppointmentsService } from './appointments.service';

/** Stub medical-records service — createInsideTx is a no-op in unit tests. */
const medicalRecordsStub = {
  createInsideTx: jest.fn(async () => undefined),
} as unknown as MedicalRecordsService;

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
  cancelledByUser: {
    id: string;
    firstNameEn: string;
    lastNameEn: string;
  } | null;
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
    cancelledByUser: null,
    ...overrides,
  };
}

/** Wrap a tx-mock object in a `$transaction` shim for complete/refer tests. */
function withTx(txObj: Record<string, unknown>): PrismaService {
  return {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
      fn(txObj),
  } as unknown as PrismaService;
}

describe('AppointmentsService.complete', () => {
  it('rejects when caller is not the doctor on the appointment', async () => {
    const prisma = withTx({
      appointment: {
        findFirst: async () =>
          baseRow({ doctorId: DOC_FOREIGN_ID, departmentId: FOREIGN_DEPT_ID }),
      },
    });
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    try {
      await service.complete(DOCTOR_USER, APPT_ID, { note: 'n/a' });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      );
    }
  });

  it('rejects from CANCELLED with 409 APPOINTMENT_NOT_BOOKED', async () => {
    const prisma = withTx({
      appointment: {
        findFirst: async () =>
          baseRow({ status: AppointmentStatus.CANCELLED }),
      },
    });
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    try {
      await service.complete(DOCTOR_USER, APPT_ID, { note: 'n/a' });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.APPOINTMENT_NOT_BOOKED);
      expect((err as AppException).getStatus()).toBe(409);
    }
  });

  it('rejects with APPOINTMENT_ALREADY_COMPLETED when already COMPLETED', async () => {
    const completedRow = baseRow({ status: AppointmentStatus.COMPLETED });

    const prisma = withTx({
      appointment: {
        findFirst: async () => completedRow,
      },
    });
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    try {
      await service.complete(DOCTOR_USER, APPT_ID, { note: 'n/a' });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.APPOINTMENT_ALREADY_COMPLETED);
      expect((err as AppException).getStatus()).toBe(409);
    }
  });

  it('transitions BOOKED → COMPLETED and stamps completedAt + updatedBy', async () => {
    const bookedRow = baseRow();
    const updatedRow = baseRow({
      status: AppointmentStatus.COMPLETED,
    });
    const updateSpy = jest.fn(async () => updatedRow);

    const prisma = withTx({
      appointment: {
        findFirst: async () => bookedRow,
        findFirstOrThrow: async () => updatedRow,
        update: updateSpy,
      },
      appointmentGroup: {
        update: jest.fn(async () => ({})),
      },
    });
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    const result = await service.complete(DOCTOR_USER, APPT_ID, { note: 'Visit complete.' });

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
    const prisma = withTx({
      appointment: {
        findFirst: async () => null,
      },
    });
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    try {
      await service.complete(DOCTOR_USER, 'missing-appt', { note: 'n/a' });
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

    const prisma = withTx({
      appointment: {
        findFirst: async () => bookedRow,
        findFirstOrThrow: async () => baseRow({ status: AppointmentStatus.COMPLETED }),
        update: updateSpy,
      },
      appointmentGroup: {
        update: jest.fn(async () => ({})),
      },
    });
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    const result = await service.complete(NURSE_USER, APPT_ID, { note: 'Nurse completed.' });

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
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    try {
      await service.refer(DOCTOR_USER, APPT_ID, {
        toDepartmentId: FOREIGN_DEPT_ID,
        note: 'Refer note.',
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
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    try {
      await service.refer(DOCTOR_USER, APPT_ID, {
        toDepartmentId: FOREIGN_DEPT_ID,
        note: 'Refer note.',
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
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    try {
      await service.refer(DOCTOR_USER, APPT_ID, {
        toDepartmentId: 'dept-missing',
        note: 'Refer note.',
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
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    const result = await service.refer(DOCTOR_USER, APPT_ID, {
      toDepartmentId: FOREIGN_DEPT_ID,
      note: 'Refer note.',
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
 * open) + Rule 2 (continuation visits must be FOLLOW_UP, PROCEDURE, or CONSULTATION).
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
    const service = new AppointmentsService(prisma, medicalRecordsStub);

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
    const service = new AppointmentsService(prisma, medicalRecordsStub);

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
    const service = new AppointmentsService(prisma, medicalRecordsStub);

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
          AppointmentType.CONSULTATION,
        ]),
      );
    }
  });

  it('accepts a CONSULTATION continuation from a COMPLETED prev', async () => {
    const createSpy = jest.fn(async () =>
      baseRow({
        appointmentType: AppointmentType.CONSULTATION,
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
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    const result = await service.create(DOCTOR_USER, {
      patientId: PATIENT_ID,
      doctorId: DOC_HOME_ID,
      departmentId: HOME_DEPT_ID,
      scheduleId: SCHEDULE_ID,
      appointmentType: AppointmentType.CONSULTATION,
      startAt: SLOT_START,
      previousAppointmentId: PREV_APPT_ID,
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(result.appointmentGroupId).toBe('group-new');
    expect(result.visitNumber).toBe(2);
  });
});

/**
 * Coverage for `cancel()` — happy path stamps the cancel audit cluster
 * (status, cancelledAt, cancelledBy, cancellationReason, updatedBy) and
 * the response carries the nested `cancelledByUser` ref so the FE can
 * render "Cancelled by <Name>" without an extra lookup.
 *
 * The DTO-level validation cases (empty / whitespace-only reason →
 * 400 VALIDATION_FAILED) live in `cancel-appointment.dto.spec.ts`
 * because the ValidationPipe rejects the body before the service runs.
 */
describe('AppointmentsService.cancel', () => {
  it('stamps the cancel audit cluster and exposes cancelledByUser on the response', async () => {
    const bookedRow = baseRow();
    const cancelledRow = baseRow({
      status: AppointmentStatus.CANCELLED,
      cancelledAt: new Date('2026-06-01T08:30:00.000Z'),
      cancelledBy: NURSE_USER.id,
      cancellationReason: 'Patient no-show',
      cancelledByUser: {
        id: NURSE_USER.id,
        firstNameEn: NURSE_USER.firstNameEn,
        lastNameEn: NURSE_USER.lastNameEn,
      },
    });
    const updateSpy = jest.fn(async () => cancelledRow);

    const prisma = {
      appointment: {
        findFirst: async () => ({
          id: bookedRow.id,
          doctorId: bookedRow.doctorId,
          departmentId: bookedRow.departmentId,
          status: bookedRow.status,
        }),
        update: updateSpy,
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    const result = await service.cancel(NURSE_USER, APPT_ID, {
      cancellationReason: 'Patient no-show',
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);

    const callArgs = (updateSpy.mock.calls[0] as unknown as [unknown])[0] as {
      data: {
        status: AppointmentStatus;
        cancelledAt: Date;
        cancelledBy: string;
        cancellationReason: string;
        updatedBy: string;
      };
    };

    expect(callArgs.data.status).toBe(AppointmentStatus.CANCELLED);
    expect(callArgs.data.cancelledAt).toBeInstanceOf(Date);
    expect(callArgs.data.cancelledBy).toBe(NURSE_USER.id);
    expect(callArgs.data.cancellationReason).toBe('Patient no-show');
    expect(callArgs.data.updatedBy).toBe(NURSE_USER.id);

    expect(result.status).toBe(AppointmentStatus.CANCELLED);
    expect(result.cancellationReason).toBe('Patient no-show');
    expect(result.cancelledBy).toBe(NURSE_USER.id);
    expect(result.cancelledByUser).toEqual({
      id: NURSE_USER.id,
      firstNameEn: NURSE_USER.firstNameEn,
      lastNameEn: NURSE_USER.lastNameEn,
    });
  });

  it('returns null cancelledByUser when the row has no cancelling user (BOOKED row mapper)', async () => {
    const bookedRow = baseRow();
    // toResponse is private but the mapper runs implicitly via cancel() —
    // simulate by having the update return an un-cancelled row (defensive:
    // proves the mapper preserves null when the relation is absent).
    const updateSpy = jest.fn(async () => bookedRow);

    const prisma = {
      appointment: {
        findFirst: async () => ({
          id: bookedRow.id,
          doctorId: bookedRow.doctorId,
          departmentId: bookedRow.departmentId,
          status: bookedRow.status,
        }),
        update: updateSpy,
      },
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma, medicalRecordsStub);

    const result = await service.cancel(NURSE_USER, APPT_ID, {
      cancellationReason: 'Patient no-show',
    });

    expect(result.cancelledByUser).toBeNull();
  });
});
