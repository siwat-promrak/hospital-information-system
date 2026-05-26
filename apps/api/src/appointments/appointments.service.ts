// Side-effect import to register dayjs plugins (`utc`,
// `isSameOrBefore`, …) before any code in this module touches them.
// `main.ts` loads the same module at app boot, but unit tests bypass
// `main.ts` so the plugins MUST be registered here too. Importing the
// module twice is safe — `dayjs.extend()` is idempotent.
import '../dayjs';

import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import dayjs from 'dayjs';

import { PERMISSION } from '../auth/permissions';
import {
  resolveAppointmentCreateScope,
  resolveAppointmentDeleteScope,
  resolveAppointmentReadScope,
  SCOPE,
} from '../auth/scope';
import { AppException } from '../common/app-exception';
import {
  isWithinBookingWindow,
  localMinuteOfDay,
} from '../common/clinic/clinic';
import { ErrorCode } from '../common/errors';
import {
  buildPaginatedResponse,
  resolvePagination,
  type Paginated,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import {
  APPOINTMENT_DB_ORDER_ASC,
  APPOINTMENT_DB_ORDER_DESC,
  APPOINTMENT_LIST_ORDER,
  BLOCKING_APPOINTMENT_STATUSES,
} from './appointments.const';
import type { ListAppointmentsArgs } from './appointments.types';
import type { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import type { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentResponseDto } from './dto/appointment.response.dto';

/**
 * Shared `include` for `Appointment` lookups. Defining it via
 * `Prisma.validator` keeps the inferred row type in sync with the
 * actual query everywhere the service serialises to
 * `AppointmentResponseDto`.
 */
const appointmentInclude = Prisma.validator<Prisma.AppointmentInclude>()({
  patient: {
    select: {
      id: true,
      hn: true,
      firstNameEn: true,
      lastNameEn: true,
      firstNameTh: true,
      lastNameTh: true,
    },
  },
  doctor: {
    select: {
      id: true,
      doctorCode: true,
      user: {
        select: {
          firstNameEn: true,
          lastNameEn: true,
        },
      },
    },
  },
  department: {
    select: {
      id: true,
      name: true,
    },
  },
});

type AppointmentRow = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

/**
 * F09 appointments service. Handles the booking transaction +
 * scope-aware list / detail / cancel surfaces.
 *
 * Scope semantics (per the CRUD-verb catalog):
 *   - `appointment.create.own`            (DOCTOR)  — self-assign only.
 *   - `appointment.create.own-department` (NURSE)   — own department only.
 *   - `appointment.read.{own,own-department,all}`   — narrow query filters.
 *   - `appointment.delete.{own,own-department}`     — cancel guard.
 */
@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Transactional booking. Validates inside a Serializable transaction
   * so a concurrent booker cannot slip a conflicting appointment between
   * the slot re-check and the insert. On Prisma's "write conflict /
   * deadlock" code (P2034) the service retries once.
   */
  async create(
    caller: AuthenticatedUser,
    dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.createWithRetry(caller, dto, /* attempt */ 0);
  }

  private async createWithRetry(
    caller: AuthenticatedUser,
    dto: CreateAppointmentDto,
    attempt: number,
  ): Promise<AppointmentResponseDto> {
    try {
      return await this.createInTransaction(caller, dto);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2034' &&
        attempt === 0
      ) {
        return this.createWithRetry(caller, dto, attempt + 1);
      }

      throw err;
    }
  }

  private async createInTransaction(
    caller: AuthenticatedUser,
    dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const startAt = dayjs.utc(dto.startAt);

    if (startAt.isSameOrBefore(dayjs.utc())) {
      throw AppException.badRequest(
        ErrorCode.APPOINTMENT_START_IN_PAST,
        'Appointment start time cannot be in the past.',
        { startAt: dto.startAt, now: dayjs.utc().toISOString() },
      );
    }

    const row = await this.prisma.$transaction(
      async (tx) => {
        // 1. (department, type) is allowed — same lookup yields the
        // per-pair duration + booking-window bounds (F13).
        const allowed = await tx.departmentAppointmentType.findFirst({
          where: {
            departmentId: dto.departmentId,
            appointmentType: dto.appointmentType,
            deletedAt: null,
          },
          select: {
            id: true,
            durationMinutes: true,
            bookingWindowStartMinute: true,
            bookingWindowEndMinute: true,
          },
        });

        if (!allowed) {
          throw AppException.badRequest(
            ErrorCode.DEPARTMENT_TYPE_NOT_ALLOWED,
            'Department does not offer this appointment type.',
            {
              departmentId: dto.departmentId,
              appointmentType: dto.appointmentType,
            },
          );
        }

        // F13 back-stop — the slot finder hides out-of-window slots in
        // the wizard, but a direct API caller could still post one.
        // Compute the local wall-clock minute-of-day at the check site
        // (CLAUDE.md §9a) and reject when it falls outside the per-pair
        // window. Either bound may be null (open-ended on that side).
        const localMin = localMinuteOfDay(startAt.toDate());

        if (
          !isWithinBookingWindow(
            localMin,
            allowed.bookingWindowStartMinute,
            allowed.bookingWindowEndMinute,
          )
        ) {
          throw AppException.badRequest(
            ErrorCode.APPOINTMENT_OUTSIDE_BOOKING_WINDOW,
            'Requested startAt falls outside the booking window for this (department, type).',
            {
              departmentId: dto.departmentId,
              appointmentType: dto.appointmentType,
              startAt: dto.startAt,
              localMinuteOfDay: localMin,
              bookingWindowStartMinute: allowed.bookingWindowStartMinute,
              bookingWindowEndMinute: allowed.bookingWindowEndMinute,
            },
          );
        }

        const endAt = startAt.add(allowed.durationMinutes, 'minute');

        // 2. Doctor exists + doctor's home dept matches.
        const doctor = await tx.doctor.findFirst({
          where: { id: dto.doctorId, deletedAt: null },
          select: {
            id: true,
            user: { select: { departmentId: true } },
          },
        });

        if (!doctor) {
          throw AppException.notFound(ErrorCode.NOT_FOUND, 'Doctor not found.');
        }

        if (doctor.user.departmentId !== dto.departmentId) {
          throw AppException.badRequest(
            ErrorCode.DOCTOR_DEPARTMENT_MISMATCH,
            "Appointment departmentId must match the doctor's current department.",
            {
              doctorId: dto.doctorId,
              requestedDepartmentId: dto.departmentId,
              doctorDepartmentId: doctor.user.departmentId,
            },
          );
        }

        // 3. Patient exists (defence — booking with a deleted patient is
        // a programmer / FE bug).
        const patient = await tx.patient.findFirst({
          where: { id: dto.patientId, deletedAt: null },
          select: { id: true },
        });

        if (!patient) {
          throw AppException.notFound(ErrorCode.NOT_FOUND, 'Patient not found.');
        }

        // 4. Schedule exists + (doctor, dept) match + bookable + slot
        //    sits inside the schedule window + slot does not cross break.
        const schedule = await tx.doctorSchedule.findFirst({
          where: {
            id: dto.scheduleId,
            doctorId: dto.doctorId,
            departmentId: dto.departmentId,
            deletedAt: null,
          },
          select: {
            id: true,
            startAt: true,
            endAt: true,
            breakStartAt: true,
            breakEndAt: true,
            acceptsBooking: true,
          },
        });

        if (!schedule) {
          throw AppException.badRequest(
            ErrorCode.SCHEDULE_NOT_FOUND_FOR_BOOKING,
            'No bookable schedule matches the booking payload.',
            {
              scheduleId: dto.scheduleId,
              doctorId: dto.doctorId,
              departmentId: dto.departmentId,
            },
          );
        }

        if (!schedule.acceptsBooking) {
          throw AppException.badRequest(
            ErrorCode.SCHEDULE_NOT_BOOKABLE,
            'The selected schedule does not accept booking.',
            { scheduleId: schedule.id },
          );
        }

        const scheduleStart = dayjs.utc(schedule.startAt);
        const scheduleEnd = dayjs.utc(schedule.endAt);

        if (startAt.isBefore(scheduleStart) || endAt.isAfter(scheduleEnd)) {
          throw AppException.badRequest(
            ErrorCode.SLOT_OUTSIDE_SCHEDULE,
            'Requested slot is outside the schedule window.',
            {
              scheduleId: schedule.id,
              slotStartAt: startAt.toISOString(),
              slotEndAt: endAt.toISOString(),
              scheduleStartAt: scheduleStart.toISOString(),
              scheduleEndAt: scheduleEnd.toISOString(),
            },
          );
        }

        if (schedule.breakStartAt !== null && schedule.breakEndAt !== null) {
          const breakStart = dayjs.utc(schedule.breakStartAt);
          const breakEnd = dayjs.utc(schedule.breakEndAt);

          // Half-open overlap: a.start < b.end && b.start < a.end.
          if (startAt.isBefore(breakEnd) && breakStart.isBefore(endAt)) {
            throw AppException.badRequest(
              ErrorCode.SLOT_OVERLAPS_BREAK,
              'Requested slot overlaps the schedule break window.',
              {
                scheduleId: schedule.id,
                slotStartAt: startAt.toISOString(),
                slotEndAt: endAt.toISOString(),
                breakStartAt: breakStart.toISOString(),
                breakEndAt: breakEnd.toISOString(),
              },
            );
          }
        }

        // 5. Slot-availability race check — half-open overlap against
        //    every BOOKED / COMPLETED appointment on the same doctor.
        const conflicting = await tx.appointment.findFirst({
          where: {
            doctorId: dto.doctorId,
            status: { in: [...BLOCKING_APPOINTMENT_STATUSES] },
            AND: [
              { startAt: { lt: endAt.toDate() } },
              { endAt: { gt: startAt.toDate() } },
            ],
          },
          select: { id: true, startAt: true, endAt: true },
        });

        if (conflicting) {
          throw AppException.conflict(
            ErrorCode.SLOT_TAKEN,
            'Another booking has just claimed this slot.',
            {
              conflictingAppointmentId: conflicting.id,
              slotStartAt: startAt.toISOString(),
              slotEndAt: endAt.toISOString(),
            },
          );
        }

        // 6. Scope dispatch (after invariants so the FE always gets the
        //    "what's wrong with the payload" diagnostic before the
        //    permission error).
        this.assertCreateScope(caller, dto);

        return tx.appointment.create({
          data: {
            patientId: dto.patientId,
            doctorId: dto.doctorId,
            departmentId: dto.departmentId,
            scheduleId: dto.scheduleId,
            appointmentType: dto.appointmentType,
            status: AppointmentStatus.BOOKED,
            startAt: startAt.toDate(),
            endAt: endAt.toDate(),
            reason: dto.reason ?? null,
            createdBy: caller.id,
          },
          include: appointmentInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.toResponse(row);
  }

  private assertCreateScope(
    caller: AuthenticatedUser,
    dto: CreateAppointmentDto,
  ): void {
    const scope = resolveAppointmentCreateScope(caller);

    if (scope === SCOPE.OWN) {
      if (!caller.doctor) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'DOCTOR user is missing a linked Doctor record.',
        );
      }

      if (caller.doctor.id !== dto.doctorId) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'DOCTOR users may only book appointments for themselves.',
          {
            required: [PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT],
            scope: SCOPE.OWN,
            requestedDoctorId: dto.doctorId,
            ownDoctorId: caller.doctor.id,
          },
        );
      }

      return;
    }

    if (scope === SCOPE.OWN_DEPARTMENT) {
      if (caller.departmentId === null) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'Caller has no department assigned and cannot use own-department scope.',
        );
      }

      if (caller.departmentId !== dto.departmentId) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'Caller may only book appointments within their own department.',
          {
            required: [PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT],
            scope: SCOPE.OWN_DEPARTMENT,
            callerDepartmentId: caller.departmentId,
            requestedDepartmentId: dto.departmentId,
          },
        );
      }

      return;
    }

    // Route guard already required one of the two perms — defensive
    // fail-closed for an unexpected catalog gap.
    throw AppException.forbidden(
      ErrorCode.INSUFFICIENT_PERMISSION,
      'Caller is missing the required permission(s).',
    );
  }

  /**
   * Paginated list with scope narrowing.
   *
   * - `.all`            → no narrowing.
   * - `.own-department` → forces `departmentId = caller.departmentId`;
   *                        explicit `?departmentId=<other>` → 403.
   * - `.own`            → forces `doctorId = caller.doctor.id`;
   *                        explicit `?doctorId=<other>` → 403.
   */
  async list(
    caller: AuthenticatedUser,
    args: ListAppointmentsArgs = {},
  ): Promise<Paginated<AppointmentResponseDto>> {
    const scope = resolveAppointmentReadScope(caller);

    const where: Prisma.AppointmentWhereInput = {};

    if (scope === SCOPE.OWN) {
      if (!caller.doctor) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'DOCTOR user is missing a linked Doctor record.',
        );
      }

      if (args.doctorId !== undefined && args.doctorId !== caller.doctor.id) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'DOCTOR users may only list their own appointments.',
        );
      }

      where.doctorId = caller.doctor.id;
    } else if (scope === SCOPE.OWN_DEPARTMENT) {
      if (caller.departmentId === null) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'Caller has no department assigned and cannot use own-department scope.',
        );
      }

      if (
        args.departmentId !== undefined &&
        args.departmentId !== caller.departmentId
      ) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'Caller may only list appointments in their own department.',
        );
      }

      where.departmentId = caller.departmentId;

      if (args.doctorId !== undefined) {
        where.doctorId = args.doctorId;
      }
    } else if (scope === SCOPE.ALL) {
      if (args.doctorId !== undefined) {
        where.doctorId = args.doctorId;
      }

      if (args.departmentId !== undefined) {
        where.departmentId = args.departmentId;
      }
    } else {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION,
        'Caller is missing the required permission(s).',
      );
    }

    if (args.patientId !== undefined) {
      where.patientId = args.patientId;
    }

    if (args.status !== undefined) {
      where.status = args.status;
    }

    if (args.from !== undefined || args.to !== undefined) {
      const startAtFilter: Prisma.DateTimeFilter = {};

      if (args.from !== undefined) {
        startAtFilter.gte = dayjs.utc(`${args.from}T00:00:00.000Z`).toDate();
      }

      if (args.to !== undefined) {
        startAtFilter.lte = dayjs
          .utc(`${args.to}T00:00:00.000Z`)
          .add(1, 'day')
          .subtract(1, 'millisecond')
          .toDate();
      }

      where.startAt = startAtFilter;
    }

    const orderBy =
      args.order === APPOINTMENT_LIST_ORDER.DESC
        ? APPOINTMENT_DB_ORDER_DESC
        : APPOINTMENT_DB_ORDER_ASC;

    const resolved = resolvePagination(args);

    const [rows, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        orderBy,
        include: appointmentInclude,
        skip: resolved.skip,
        take: resolved.take,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    const data = rows.map((row) => this.toResponse(row));

    return buildPaginatedResponse(data, total, resolved);
  }

  /**
   * Detail lookup. Out-of-scope row → `404 APPOINTMENT_NOT_FOUND` so
   * probing for foreign ids does not leak existence.
   */
  async getById(
    caller: AuthenticatedUser,
    id: string,
  ): Promise<AppointmentResponseDto> {
    const row = await this.prisma.appointment.findFirst({
      where: { id },
      include: appointmentInclude,
    });

    if (!row) {
      throw AppException.notFound(
        ErrorCode.APPOINTMENT_NOT_FOUND,
        'Appointment not found.',
      );
    }

    const scope = resolveAppointmentReadScope(caller);

    if (scope === SCOPE.OWN) {
      if (!caller.doctor || caller.doctor.id !== row.doctorId) {
        throw AppException.notFound(
          ErrorCode.APPOINTMENT_NOT_FOUND,
          'Appointment not found.',
        );
      }
    } else if (scope === SCOPE.OWN_DEPARTMENT) {
      if (
        caller.departmentId === null ||
        caller.departmentId !== row.departmentId
      ) {
        throw AppException.notFound(
          ErrorCode.APPOINTMENT_NOT_FOUND,
          'Appointment not found.',
        );
      }
    } else if (scope !== SCOPE.ALL) {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION,
        'Caller is missing the required permission(s).',
      );
    }

    return this.toResponse(row);
  }

  /**
   * Cancel. Sets `status = CANCELLED`, records the cancel audit cluster,
   * and frees the slot for immediate reuse (US-6.2). Already-CANCELLED
   * → `409 APPOINTMENT_ALREADY_CANCELLED`; already-COMPLETED → `409
   * APPOINTMENT_ALREADY_COMPLETED`. Scope mirrors the create-side
   * dispatch.
   */
  async cancel(
    caller: AuthenticatedUser,
    id: string,
    dto: CancelAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const existing = await this.prisma.appointment.findFirst({
      where: { id },
      select: {
        id: true,
        doctorId: true,
        departmentId: true,
        status: true,
      },
    });

    if (!existing) {
      throw AppException.notFound(
        ErrorCode.APPOINTMENT_NOT_FOUND,
        'Appointment not found.',
      );
    }

    this.assertDeleteScope(caller, existing.doctorId, existing.departmentId);

    if (existing.status === AppointmentStatus.CANCELLED) {
      throw AppException.conflict(
        ErrorCode.APPOINTMENT_ALREADY_CANCELLED,
        'Appointment is already cancelled.',
        { appointmentId: existing.id },
      );
    }

    if (existing.status === AppointmentStatus.COMPLETED) {
      throw AppException.conflict(
        ErrorCode.APPOINTMENT_ALREADY_COMPLETED,
        'Appointment is already completed and cannot be cancelled.',
        { appointmentId: existing.id },
      );
    }

    const row = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: dayjs.utc().toDate(),
        cancelledBy: caller.id,
        cancellationReason: dto.cancellationReason ?? null,
        updatedBy: caller.id,
      },
      include: appointmentInclude,
    });

    return this.toResponse(row);
  }

  private assertDeleteScope(
    caller: AuthenticatedUser,
    targetDoctorId: string,
    targetDepartmentId: string,
  ): void {
    const scope = resolveAppointmentDeleteScope(caller);

    if (scope === SCOPE.OWN_DEPARTMENT) {
      if (caller.departmentId === null) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'Caller has no department assigned and cannot use own-department scope.',
        );
      }

      if (caller.departmentId !== targetDepartmentId) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'Caller may only cancel appointments in their own department.',
          {
            required: [PERMISSION.APPOINTMENT_DELETE_OWN_DEPARTMENT],
            scope: SCOPE.OWN_DEPARTMENT,
            callerDepartmentId: caller.departmentId,
            requestedDepartmentId: targetDepartmentId,
          },
        );
      }

      return;
    }

    if (scope === SCOPE.OWN) {
      if (!caller.doctor) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'DOCTOR user is missing a linked Doctor record.',
        );
      }

      if (caller.doctor.id !== targetDoctorId) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'DOCTOR users may only cancel their own appointments.',
          {
            required: [PERMISSION.APPOINTMENT_DELETE_OWN_DEPARTMENT],
            scope: SCOPE.OWN,
            requestedDoctorId: targetDoctorId,
            ownDoctorId: caller.doctor.id,
          },
        );
      }

      return;
    }

    throw AppException.forbidden(
      ErrorCode.INSUFFICIENT_PERMISSION,
      'Caller is missing the required permission(s).',
    );
  }

  private toResponse(row: AppointmentRow): AppointmentResponseDto {
    return {
      id: row.id,
      patientId: row.patientId,
      doctorId: row.doctorId,
      departmentId: row.departmentId,
      scheduleId: row.scheduleId,
      appointmentType: row.appointmentType,
      status: row.status,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      reason: row.reason,
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      cancellationReason: row.cancellationReason,
      cancelledBy: row.cancelledBy,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      patient: {
        id: row.patient.id,
        hn: row.patient.hn,
        firstNameEn: row.patient.firstNameEn,
        lastNameEn: row.patient.lastNameEn,
        firstNameTh: row.patient.firstNameTh,
        lastNameTh: row.patient.lastNameTh,
      },
      doctor: {
        id: row.doctor.id,
        doctorCode: row.doctor.doctorCode,
        firstNameEn: row.doctor.user.firstNameEn,
        lastNameEn: row.doctor.user.lastNameEn,
      },
      department: {
        id: row.department.id,
        name: row.department.name,
      },
    };
  }
}

