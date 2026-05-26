// Side-effect import to register dayjs plugins (`utc`,
// `isSameOrBefore`, …) before any code in this module touches them.
// `main.ts` loads the same module at app boot, but unit tests bypass
// `main.ts` so the plugins MUST be registered here too. Importing the
// module twice is safe — `dayjs.extend()` is idempotent.
import '../dayjs';

import { Injectable } from '@nestjs/common';
import { AppointmentStatus, AppointmentType, Prisma } from '@prisma/client';
import dayjs from 'dayjs';

import { PERMISSION } from '../auth/permissions';
import {
  resolveAppointmentCreateScope,
  resolveAppointmentDeleteScope,
  resolveAppointmentReadScope,
  resolveAppointmentUpdateScope,
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
import { computeSchedulesSlots } from '../slots/slots.service';
import type { AuthenticatedUser } from '../users/users.types';

import {
  APPOINTMENT_DB_ORDER_ASC,
  APPOINTMENT_DB_ORDER_DESC,
  APPOINTMENT_LIST_ORDER,
  BLOCKING_APPOINTMENT_STATUSES,
  CONTINUATION_APPOINTMENT_TYPES,
  type ContinuationAppointmentType,
} from './appointments.const';
import type { ListAppointmentsArgs } from './appointments.types';
import type { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import type { CreateAppointmentDto } from './dto/create-appointment.dto';
import type { ReferAppointmentDto } from './dto/refer-appointment.dto';
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
      // Prisma's P2034 surfaces a Postgres "could not serialize access"
      // (40001) — expected under Serializable isolation when two
      // booking transactions land on overlapping data. F14 widens the
      // transaction footprint (group materialisation + back-link
      // updates), so concurrent suites can hit the retry more than
      // once. Cap at 5 attempts (matches the Postgres community
      // convention for serialization-failure retry budgets) so a
      // genuine deadlock still surfaces eventually.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2034' &&
        attempt < 4
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
    // Capture `now` once at the entry point so every downstream check
    // (past-cutoff + grid alignment) reasons against the same wall-clock
    // reading. The transaction body may take 10s of ms; without a shared
    // `now`, a slot that's "just in the future" at line 1 could become
    // "exactly now" by the time the grid check runs, surfacing a
    // misleading `SLOT_NOT_ON_GRID` instead of the real
    // `APPOINTMENT_START_IN_PAST`.
    const now = dayjs.utc();

    if (startAt.isSameOrBefore(now)) {
      throw AppException.badRequest(
        ErrorCode.APPOINTMENT_START_IN_PAST,
        'Appointment start time cannot be in the past.',
        { startAt: dto.startAt, now: now.toISOString() },
      );
    }

    const row = await this.prisma.$transaction(
      async (tx) => {
        // 0. F14 — lazy group + referral fulfilment.
        //
        // When `previousAppointmentId` is set:
        //   a. Load + validate prev (same patient, COMPLETED, not in a
        //      closed group).
        //   b. Reject continuations whose appointmentType is not in
        //      `CONTINUATION_APPOINTMENT_TYPES` (FOLLOW_UP / PROCEDURE).
        //   c. If prev has a group → take group_id + compute
        //      visit_number = max(visitNumber) + 1.
        //   d. If prev has no group → create a fresh group, back-link
        //      prev (visit_number = 1), set new's visit_number = 2.
        //   e. If prev carries a referral whose destination matches the
        //      new row's department, set
        //      `prev.referralFulfilledByAppointmentId = new.id` in the
        //      same transaction. Mismatch → 400; already-fulfilled →
        //      409.
        //
        // Runs BEFORE the (department, type) allowed-types check so a
        // continuation booking surfaces the more specific
        // `CONTINUATION_APPOINTMENT_TYPE_INVALID` rather than the
        // generic `DEPARTMENT_TYPE_NOT_ALLOWED`.
        const grouping = await this.resolveGrouping(tx, caller, dto);

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

        const endAt = startAt.add(allowed.durationMinutes, 'minute');

        // F13 back-stop — the slot finder hides out-of-window slots in
        // the wizard, but a direct API caller could still post one.
        // Compute the local wall-clock minute-of-day at the check site
        // (CLAUDE.md §9a) and reject when the WHOLE slot
        // [startMin, endMin) doesn't fit inside the per-pair window.
        // Checking only the start would let a 30-min slot at 10:40 pass
        // a window-end of 11:00 even though it actually ends at 11:10.
        const slotStartLocalMin = localMinuteOfDay(startAt.toDate());
        const slotEndLocalMin = localMinuteOfDay(endAt.toDate());

        if (
          !isWithinBookingWindow(
            slotStartLocalMin,
            slotEndLocalMin,
            allowed.bookingWindowStartMinute,
            allowed.bookingWindowEndMinute,
          )
        ) {
          throw AppException.badRequest(
            ErrorCode.APPOINTMENT_OUTSIDE_BOOKING_WINDOW,
            'Requested slot falls outside the booking window for this (department, type).',
            {
              departmentId: dto.departmentId,
              appointmentType: dto.appointmentType,
              startAt: dto.startAt,
              endAt: endAt.toISOString(),
              slotStartLocalMinute: slotStartLocalMin,
              slotEndLocalMinute: slotEndLocalMin,
              bookingWindowStartMinute: allowed.bookingWindowStartMinute,
              bookingWindowEndMinute: allowed.bookingWindowEndMinute,
            },
          );
        }

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

        // 5. Slot-availability race check + grid alignment. Fetch every
        //    BOOKED / COMPLETED appointment that intersects the schedule
        //    range so both the conflict check (SLOT_TAKEN) AND the grid
        //    alignment check (SLOT_NOT_ON_GRID) can reason about the same
        //    blocker set without a second round-trip.
        const blockers = await tx.appointment.findMany({
          where: {
            doctorId: dto.doctorId,
            status: { in: [...BLOCKING_APPOINTMENT_STATUSES] },
            startAt: { lt: schedule.endAt },
            endAt: { gt: schedule.startAt },
          },
          select: { id: true, startAt: true, endAt: true },
        });

        const conflicting = blockers.find(
          (b) => b.startAt < endAt.toDate() && b.endAt > startAt.toDate(),
        );

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

        // 5a. Grid alignment — the slot finder re-anchors the grid at
        //     each free-interval start (sliding-window). Direct API
        //     callers MUST land on one of those positions; a freehand
        //     `startAt` (e.g., 09:07 when the grid offers 09:15 / 10:15)
        //     would otherwise let bookings slip through that the finder
        //     never surfaced. Re-uses the pure slot-grid step with a
        //     throwaway doctor ref (the grid step doesn't check identity)
        //     and the shared `now` captured at the entry point.
        const offered = computeSchedulesSlots({
          schedule: {
            id: schedule.id,
            departmentId: dto.departmentId,
            startAt: schedule.startAt,
            endAt: schedule.endAt,
            breakStartAt: schedule.breakStartAt,
            breakEndAt: schedule.breakEndAt,
            doctor: { id: dto.doctorId, doctorCode: '', name: '' },
          },
          durationMinutes: allowed.durationMinutes,
          bookingWindowStartMinute: allowed.bookingWindowStartMinute,
          bookingWindowEndMinute: allowed.bookingWindowEndMinute,
          blockingAppointments: blockers,
          now: now.toDate(),
        });

        const slotStartIso = startAt.toISOString();

        if (!offered.some((s) => s.startAt === slotStartIso)) {
          throw AppException.badRequest(
            ErrorCode.SLOT_NOT_ON_GRID,
            'Requested startAt does not align to a slot offered by the slot finder for this schedule.',
            {
              scheduleId: schedule.id,
              slotStartAt: slotStartIso,
              durationMinutes: allowed.durationMinutes,
            },
          );
        }

        // 6. Scope dispatch (after invariants so the FE always gets the
        //    "what's wrong with the payload" diagnostic before the
        //    permission error).
        this.assertCreateScope(caller, dto);

        const created = await tx.appointment.create({
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
            appointmentGroupId: grouping.groupId,
            visitNumber: grouping.visitNumber,
          },
          include: appointmentInclude,
        });

        // Post-insert fulfilment back-link (only set when grouping
        // determined the new row picks up a pending referral).
        if (grouping.previousAppointmentToFulfillId !== null) {
          await tx.appointment.update({
            where: { id: grouping.previousAppointmentToFulfillId },
            data: {
              referralFulfilledByAppointmentId: created.id,
              updatedBy: caller.id,
            },
          });
        }

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.toResponse(row);
  }

  /**
   * Resolve the F14 grouping for a `POST /appointments` payload.
   *
   * Returns the `(groupId, visitNumber)` pair that should be written
   * onto the new row PLUS the optional id of the previous-appointment
   * row whose `referralFulfilledByAppointmentId` should be set to the
   * new row's id after insert.
   *
   * Standalone bookings (no `previousAppointmentId`) return all-null.
   *
   * Runs inside the create-appointment serializable transaction.
   */
  private async resolveGrouping(
    tx: Prisma.TransactionClient,
    caller: AuthenticatedUser,
    dto: CreateAppointmentDto,
  ): Promise<{
    groupId: string | null;
    visitNumber: number | null;
    previousAppointmentToFulfillId: string | null;
  }> {
    if (!dto.previousAppointmentId) {
      return {
        groupId: null,
        visitNumber: null,
        previousAppointmentToFulfillId: null,
      };
    }

    const prev = await tx.appointment.findFirst({
      where: { id: dto.previousAppointmentId },
      select: {
        id: true,
        patientId: true,
        departmentId: true,
        status: true,
        appointmentGroupId: true,
        visitNumber: true,
        referredToDepartmentId: true,
        referralFulfilledByAppointmentId: true,
      },
    });

    if (!prev) {
      throw AppException.notFound(
        ErrorCode.PREVIOUS_APPOINTMENT_NOT_FOUND,
        'Previous appointment not found.',
      );
    }

    if (prev.patientId !== dto.patientId) {
      throw AppException.badRequest(
        ErrorCode.APPOINTMENT_GROUP_PATIENT_MISMATCH,
        "Continuation booking patient must match the previous appointment's patient.",
        {
          previousAppointmentId: prev.id,
          previousPatientId: prev.patientId,
          requestedPatientId: dto.patientId,
        },
      );
    }

    if (prev.status === AppointmentStatus.CANCELLED) {
      throw AppException.badRequest(
        ErrorCode.PREVIOUS_APPOINTMENT_CANCELLED,
        'Cannot continue from a cancelled appointment.',
        { previousAppointmentId: prev.id },
      );
    }

    if (prev.status === AppointmentStatus.BOOKED) {
      throw AppException.badRequest(
        ErrorCode.PREVIOUS_APPOINTMENT_NOT_COMPLETED,
        'Previous appointment must be COMPLETED before a continuation can be booked.',
        { previousAppointmentId: prev.id, previousStatus: prev.status },
      );
    }

    // Group-closed must fire before the continuation-type check so the
    // FE gets the more specific "group is closed" diagnostic when both
    // would otherwise apply.
    if (prev.appointmentGroupId !== null) {
      const closedGuard = await tx.appointmentGroup.findFirst({
        where: { id: prev.appointmentGroupId },
        select: { id: true, closedAt: true },
      });

      if (!closedGuard) {
        throw AppException.notFound(
          ErrorCode.APPOINTMENT_GROUP_NOT_FOUND,
          'Appointment group not found.',
        );
      }

      if (closedGuard.closedAt !== null) {
        throw AppException.badRequest(
          ErrorCode.APPOINTMENT_GROUP_CLOSED,
          'Appointment group is closed — cannot attach further visits.',
          {
            groupId: closedGuard.id,
            closedAt: closedGuard.closedAt.toISOString(),
          },
        );
      }
    }

    // Continuation visits must be FOLLOW_UP or PROCEDURE — a new
    // patient visit is by definition not a continuation, and a
    // consultation is a fresh advisory. Surfaces as
    // `400 CONTINUATION_APPOINTMENT_TYPE_INVALID`.
    if (
      !(CONTINUATION_APPOINTMENT_TYPES as readonly AppointmentType[]).includes(
        dto.appointmentType,
      )
    ) {
      throw AppException.badRequest(
        ErrorCode.CONTINUATION_APPOINTMENT_TYPE_INVALID,
        'Continuation visits must be FOLLOW_UP or PROCEDURE.',
        {
          previousAppointmentId: prev.id,
          appointmentType: dto.appointmentType,
          allowedAppointmentTypes:
            CONTINUATION_APPOINTMENT_TYPES as readonly ContinuationAppointmentType[],
        },
      );
    }

    // Referral consistency — when prev carries a referral, the new
    // department MUST match the destination AND the referral must not
    // already be fulfilled.
    let previousAppointmentToFulfillId: string | null = null;

    if (prev.referredToDepartmentId !== null) {
      if (prev.referralFulfilledByAppointmentId !== null) {
        throw AppException.conflict(
          ErrorCode.REFERRAL_ALREADY_FULFILLED,
          'This referral has already been picked up by another appointment.',
          {
            previousAppointmentId: prev.id,
            existingFulfillmentId: prev.referralFulfilledByAppointmentId,
          },
        );
      }

      if (prev.referredToDepartmentId !== dto.departmentId) {
        throw AppException.badRequest(
          ErrorCode.REFERRAL_DEPARTMENT_MISMATCH,
          "Continuation department must match the previous appointment's referral destination.",
          {
            previousAppointmentId: prev.id,
            referredToDepartmentId: prev.referredToDepartmentId,
            requestedDepartmentId: dto.departmentId,
          },
        );
      }

      previousAppointmentToFulfillId = prev.id;
    }

    // Existing group → attach as the next visit number. The group's
    // open / closed status was already validated above (we only reach
    // here when the group exists and `closedAt IS NULL`).
    if (prev.appointmentGroupId !== null) {
      const max = await tx.appointment.aggregate({
        where: { appointmentGroupId: prev.appointmentGroupId },
        _max: { visitNumber: true },
      });

      const nextVisit = (max._max.visitNumber ?? 0) + 1;

      return {
        groupId: prev.appointmentGroupId,
        visitNumber: nextVisit,
        previousAppointmentToFulfillId,
      };
    }

    // No group yet on prev → materialise one, back-link prev as visit 1.
    // CreatedBy attribution mirrors the booking caller (the originator
    // of the continuation that triggered the lazy creation).
    const newGroup = await tx.appointmentGroup.create({
      data: {
        patientId: prev.patientId,
        createdBy: caller.id,
      },
    });

    await tx.appointment.update({
      where: { id: prev.id },
      data: {
        appointmentGroupId: newGroup.id,
        visitNumber: 1,
      },
    });

    return {
      groupId: newGroup.id,
      visitNumber: 2,
      previousAppointmentToFulfillId,
    };
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

    // F14 — the pending-referral pickup queue uses a different scope
    // axis than the standard listing. For NURSE in dept B viewing the
    // queue, the source rows live in OTHER departments (whoever made
    // the referral), so narrowing by `departmentId = ownDept` would
    // hide them. Instead, the scope must allow rows where
    // `referredToDepartmentId = ownDept`. MRO (`.all`) sees referrals
    // to every destination department.
    const pickupQueueRequested = args.pendingReferralOnly === true;

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

      if (pickupQueueRequested) {
        // Pickup queue mode: the destination axis replaces the standard
        // `departmentId = ownDept` narrowing. BE auto-narrows by the
        // caller's own department — the user cannot peek into another
        // dept's queue.
        where.referredToDepartmentId = caller.departmentId;
      } else {
        where.departmentId = caller.departmentId;
      }

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

    if (pickupQueueRequested) {
      // Strict pickup-queue filter: only COMPLETED visits that carry a
      // pending referral (referred to a department + not yet fulfilled).
      // For `.own-department` the scope branch above already pinned
      // `referredToDepartmentId = caller.departmentId`; for `.all` MRO,
      // we narrow to "any non-null destination" so unreferred rows
      // don't leak into the queue.
      where.status = AppointmentStatus.COMPLETED;

      if (where.referredToDepartmentId === undefined) {
        where.referredToDepartmentId = { not: null };
      }

      where.referralFulfilledByAppointmentId = null;
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

  /**
   * F14 — `POST /appointments/:id/complete`. Transitions `BOOKED →
   * COMPLETED`. Idempotent on `COMPLETED`; rejects from `CANCELLED`
   * with `409 APPOINTMENT_NOT_BOOKED`. Caller MUST be the doctor on
   * the appointment (`appointment.update.own`).
   *
   * No group / referral side-effect — this is the "completion-only"
   * ending, symmetric with `cancel`.
   */
  async complete(
    caller: AuthenticatedUser,
    id: string,
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

    this.assertUpdateScope(caller, existing.doctorId, existing.departmentId);

    if (existing.status === AppointmentStatus.COMPLETED) {
      // Idempotent — re-fetch with the wire include and return.
      const row = await this.prisma.appointment.findFirstOrThrow({
        where: { id },
        include: appointmentInclude,
      });

      return this.toResponse(row);
    }

    if (existing.status === AppointmentStatus.CANCELLED) {
      throw AppException.conflict(
        ErrorCode.APPOINTMENT_NOT_BOOKED,
        'Appointment is not in a bookable state and cannot be completed.',
        { appointmentId: existing.id, status: existing.status },
      );
    }

    const row = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.COMPLETED,
        completedAt: dayjs.utc().toDate(),
        updatedBy: caller.id,
      },
      include: appointmentInclude,
    });

    return this.toResponse(row);
  }

  /**
   * F14 — `POST /appointments/:id/refer`. Atomic transition: status →
   * `COMPLETED`, `referredToDepartmentId = body.toDepartmentId`,
   * `referredAt = now()`. The group stays open — closing is the
   * separate `POST /appointment-groups/:id/close` action.
   *
   * Auth: caller MUST be the doctor on the appointment
   * (`appointment.update.own`).
   *
   * A second refer attempt on the same row returns
   * `409 APPOINTMENT_ALREADY_REFERRED` — the referral pair is set
   * exactly once.
   */
  async refer(
    caller: AuthenticatedUser,
    id: string,
    dto: ReferAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.appointment.findFirst({
        where: { id },
        select: {
          id: true,
          doctorId: true,
          departmentId: true,
          status: true,
          referredToDepartmentId: true,
        },
      });

      if (!existing) {
        throw AppException.notFound(
          ErrorCode.APPOINTMENT_NOT_FOUND,
          'Appointment not found.',
        );
      }

      this.assertUpdateScope(caller, existing.doctorId, existing.departmentId);

      if (existing.referredToDepartmentId !== null) {
        throw AppException.conflict(
          ErrorCode.APPOINTMENT_ALREADY_REFERRED,
          'Appointment has already been referred.',
          {
            appointmentId: existing.id,
            referredToDepartmentId: existing.referredToDepartmentId,
          },
        );
      }

      if (existing.status === AppointmentStatus.CANCELLED) {
        throw AppException.conflict(
          ErrorCode.APPOINTMENT_NOT_BOOKED,
          'Cancelled appointment cannot be referred.',
          { appointmentId: existing.id, status: existing.status },
        );
      }

      // FK existence — surface a clean 400 rather than letting the DB
      // FK violation propagate as an opaque 500.
      const destination = await tx.department.findFirst({
        where: { id: dto.toDepartmentId, deletedAt: null },
        select: { id: true },
      });

      if (!destination) {
        throw AppException.badRequest(
          ErrorCode.NOT_FOUND,
          'Destination department not found.',
          { toDepartmentId: dto.toDepartmentId },
        );
      }

      const now = dayjs.utc().toDate();
      const isAlreadyCompleted = existing.status === AppointmentStatus.COMPLETED;

      return tx.appointment.update({
        where: { id },
        data: {
          status: AppointmentStatus.COMPLETED,
          completedAt: isAlreadyCompleted ? undefined : now,
          referredToDepartmentId: dto.toDepartmentId,
          referredAt: now,
          updatedBy: caller.id,
        },
        include: appointmentInclude,
      });
    });

    return this.toResponse(row);
  }

  /**
   * Shared assertion helper for the F14 doctor-only actions (`complete`
   * / `refer`). Mirrors the cancel-side scope dispatch but reads from
   * the `appointment.update.*` family.
   */
  private assertUpdateScope(
    caller: AuthenticatedUser,
    targetDoctorId: string,
    targetDepartmentId: string,
  ): void {
    const scope = resolveAppointmentUpdateScope(caller);

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
          'Caller may only update appointments in their own department.',
          {
            required: [PERMISSION.APPOINTMENT_UPDATE_OWN_DEPARTMENT],
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
          'DOCTOR users may only update their own appointments.',
          {
            required: [PERMISSION.APPOINTMENT_UPDATE_OWN],
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
      appointmentGroupId: row.appointmentGroupId,
      visitNumber: row.visitNumber,
      referredToDepartmentId: row.referredToDepartmentId,
      referredAt: row.referredAt ? row.referredAt.toISOString() : null,
      referralFulfilledByAppointmentId: row.referralFulfilledByAppointmentId,
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

