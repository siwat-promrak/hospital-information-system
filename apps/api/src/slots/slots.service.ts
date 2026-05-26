// Side-effect import to register dayjs plugins (`utc`, `isSameOrBefore`,
// `isSameOrAfter`, …) before any code in this module touches them.
// `main.ts` loads the same module at app boot, but unit tests bypass
// `main.ts` so the plugins MUST be registered here too. Importing the
// module twice is safe — `dayjs.extend()` is idempotent.
import '../dayjs';

import { Injectable } from '@nestjs/common';
import { AppointmentType } from '@prisma/client';
import dayjs from 'dayjs';

import { PERMISSION } from '../auth/permissions';
import { resolveAppointmentWriteScope, SCOPE } from '../auth/scope';
import { AppException } from '../common/app-exception';
import {
  isWithinBookingWindow,
  localMinuteOfDay,
} from '../common/clinic/clinic';
import { ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import { BLOCKING_APPOINTMENT_STATUSES, SLOT_ERROR_CODE } from './slots.const';
import type {
  ComputeScheduleSlotsArgs,
  DepartmentTypeRule,
  FindSlotsArgs,
  ResolvedDayBounds,
  ScheduleWindow,
  SlotResult,
} from './slots.types';

/**
 * F07 slot finder — computes the open slot grid for one
 * `(doctor, department, date, appointmentType)` tuple.
 *
 * The algorithm runs in three phases:
 *
 *  1. **Validate inputs at the domain layer**: doctor must exist (and not
 *     be soft-deleted); the `(departmentId, type)` pair must appear in
 *     `department_appointment_types` (US-6.2 — `400
 *     DEPARTMENT_TYPE_NOT_ALLOWED`). The same lookup also yields the
 *     per-pair `durationMinutes` + nullable booking-window bounds (F13).
 *  2. **Fetch the day's working windows**: every active (non-soft-deleted)
 *     `DoctorSchedule` for `(doctorId, departmentId)` whose
 *     `[startAt, endAt)` intersects the UTC calendar day, AND whose
 *     `acceptsBooking = true`. Each schedule contributes its own slot grid.
 *  3. **Step the grid + apply exclusions**: for each schedule, step
 *     `[startAt, endAt)` by `durationMinutes`, yielding
 *     `[step, step + duration)` slots. Exclude any slot that
 *     - intersects the schedule's break window (when set), OR
 *     - intersects an appointment on that doctor that day with status
 *       `BOOKED` or `COMPLETED` (CANCELLED frees the slot — there is no
 *       tombstone column on `Appointment`), OR
 *     - starts at or before `now` (server `dayjs.utc()`), OR
 *     - falls outside the per-pair booking window (F13 — local wall-clock
 *       minute-of-day check).
 *
 * Returns a chronologically-sorted flat array. Empty array (never 404)
 * when nothing matches — including a fully-past `date`, which still
 * resolves to `[] / 200` per US-6.2.
 *
 * The finder does NOT take a transaction: F08's booking endpoint will
 * re-check inside a serializable transaction to defend against races.
 */
@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findSlots(
    caller: AuthenticatedUser,
    args: FindSlotsArgs,
  ): Promise<SlotResult[]> {
    await this.assertScope(caller, args.doctorId, args.departmentId);
    await this.assertDoctorExists(args.doctorId);

    const rule = await this.loadDepartmentTypeRule(
      args.departmentId,
      args.type,
    );

    const { dayStart, dayEnd } = resolveDayBounds(args.date);

    const schedules = await this.prisma.doctorSchedule.findMany({
      where: {
        doctorId: args.doctorId,
        departmentId: args.departmentId,
        deletedAt: null,
        acceptsBooking: true,
        // Half-open intersection: window starts before the end-of-day
        // bound AND ends after the start-of-day bound.
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: {
        id: true,
        departmentId: true,
        startAt: true,
        endAt: true,
        breakStartAt: true,
        breakEndAt: true,
      },
      orderBy: { startAt: 'asc' },
    });

    if (schedules.length === 0) {
      return [];
    }

    // Cover the FULL range of schedules being processed, not just the
    // requested UTC day. A schedule that spans midnight UTC emits slots
    // on both sides of the boundary, so a booking in the next-day portion
    // would otherwise be silently dropped from the blocker set (its
    // `startAt >= dayEnd`) and the slot finder would re-emit an already-
    // booked slot. Compute the union [min(startAt), max(endAt)) across
    // fetched schedules and use that as the half-open filter bound.
    const scheduleRangeStart = schedules.reduce<Date>(
      (acc, s) => (s.startAt < acc ? s.startAt : acc),
      schedules[0].startAt,
    );
    const scheduleRangeEnd = schedules.reduce<Date>(
      (acc, s) => (s.endAt > acc ? s.endAt : acc),
      schedules[0].endAt,
    );

    const blockingAppointments = await this.prisma.appointment.findMany({
      where: {
        doctorId: args.doctorId,
        status: { in: [...BLOCKING_APPOINTMENT_STATUSES] },
        // Half-open overlap against the schedule union — keeps the query
        // indexable AND covers slots that spill past midnight UTC.
        startAt: { lt: scheduleRangeEnd },
        endAt: { gt: scheduleRangeStart },
      },
      select: { startAt: true, endAt: true },
    });

    const now = dayjs.utc();

    const slots: SlotResult[] = [];

    for (const schedule of schedules) {
      const scheduleSlots = computeSchedulesSlots({
        schedule,
        durationMinutes: rule.durationMinutes,
        bookingWindowStartMinute: rule.bookingWindowStartMinute,
        bookingWindowEndMinute: rule.bookingWindowEndMinute,
        blockingAppointments,
        now: now.toDate(),
      });

      slots.push(...scheduleSlots);
    }

    // Multiple windows in one day → make sure the merged output is sorted.
    slots.sort((a, b) => dayjs(a.startAt).valueOf() - dayjs(b.startAt).valueOf());

    return slots;
  }

  /**
   * Honor the scope encoded on the caller's `appointment.create.*`
   * permission:
   *
   *   - `.all`            → future-proof short-circuit (no role holds
   *                         this today).
   *   - `.own-department` → NURSE: may only probe slots for doctors in
   *                         their own department.
   *   - `.own`            → DOCTOR self-booking: may only probe their
   *                         own doctor row, regardless of the
   *                         `departmentId` filter — cross-doctor
   *                         requests return `INSUFFICIENT_PERMISSION_SCOPE`
   *                         so probing for foreign doctors does not
   *                         leak existence.
   *
   * ADMIN / MEDICAL_RECORDS_OFFICER / PHARMACY hit the route-permission
   * guard (`403 INSUFFICIENT_PERMISSION`) before this method runs.
   */
  private async assertScope(
    caller: AuthenticatedUser,
    doctorId: string,
    departmentId: string,
  ): Promise<void> {
    const scope = resolveAppointmentWriteScope(caller);

    if (scope === SCOPE.ALL) {
      return;
    }

    if (scope === SCOPE.OWN_DEPARTMENT) {
      if (caller.departmentId === null || caller.departmentId !== departmentId) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'Slot finder is restricted to your own department.',
          {
            required: [PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT],
            scope: SCOPE.OWN_DEPARTMENT,
            requestedDepartmentId: departmentId,
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

      if (caller.doctor.id !== doctorId) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'DOCTOR users may only probe slots for themselves.',
          {
            required: [PERMISSION.APPOINTMENT_CREATE_OWN],
            scope: SCOPE.OWN,
            requestedDoctorId: doctorId,
            ownDoctorId: caller.doctor.id,
          },
        );
      }

      return;
    }

    throw AppException.forbidden(
      ErrorCode.INSUFFICIENT_PERMISSION,
      'Caller is missing the required permission(s).',
      {
        required: [
          PERMISSION.APPOINTMENT_CREATE_OWN,
          PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
        ],
        held: [...caller.permissionCodes],
      },
    );
  }

  private async assertDoctorExists(doctorId: string): Promise<void> {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: doctorId, deletedAt: null },
      select: { id: true },
    });

    if (!doctor) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Doctor not found.');
    }
  }

  /**
   * Single `department_appointment_types` lookup — verifies the
   * `(departmentId, type)` pair is allowed AND returns the per-pair
   * `durationMinutes` + booking-window bounds. Replaces the previous
   * boolean existence check + global const lookup with one round-trip
   * that yields everything the grid step needs (F13).
   */
  private async loadDepartmentTypeRule(
    departmentId: string,
    appointmentType: AppointmentType,
  ): Promise<DepartmentTypeRule> {
    const row = await this.prisma.departmentAppointmentType.findFirst({
      where: {
        departmentId,
        appointmentType,
        deletedAt: null,
      },
      select: {
        durationMinutes: true,
        bookingWindowStartMinute: true,
        bookingWindowEndMinute: true,
      },
    });

    if (!row) {
      throw AppException.badRequest(
        SLOT_ERROR_CODE.DEPARTMENT_TYPE_NOT_ALLOWED,
        'Department does not offer this appointment type.',
        { departmentId, appointmentType },
      );
    }

    return {
      durationMinutes: row.durationMinutes,
      bookingWindowStartMinute: row.bookingWindowStartMinute,
      bookingWindowEndMinute: row.bookingWindowEndMinute,
    };
  }
}

/**
 * Compute the UTC day bounds for an ISO calendar date (`YYYY-MM-DD`).
 *
 * Returns `[dayStart, dayEnd)` — start of day inclusive, start of NEXT
 * day exclusive. The half-open shape mirrors the schedule overlap rule
 * elsewhere in the codebase (`a.startAt < b.endAt && b.startAt < a.endAt`)
 * so a schedule whose `startAt === dayEnd` does NOT intersect the day.
 *
 * Exported so unit tests can probe the math directly.
 */
export function resolveDayBounds(isoDate: string): ResolvedDayBounds {
  const start = dayjs.utc(`${isoDate}T00:00:00.000Z`);
  const end = start.add(1, 'day');

  return {
    dayStart: start.toDate(),
    dayEnd: end.toDate(),
  };
}

/**
 * Pure slot-grid computation for ONE schedule. Exported so unit tests can
 * exercise the algebra without the full `findSlots` plumbing
 * (`findMany`, doctor lookup, `(deptId, type)` check, …). Returns slot
 * objects already shaped for the wire (`SlotResult`). See
 * `ComputeScheduleSlotsArgs` in `slots.types.ts` for the input contract.
 */
export function computeSchedulesSlots(
  args: ComputeScheduleSlotsArgs,
): SlotResult[] {
  const {
    schedule,
    durationMinutes,
    bookingWindowStartMinute,
    bookingWindowEndMinute,
    blockingAppointments,
    now,
  } = args;
  const slots: SlotResult[] = [];

  const scheduleEnd = dayjs.utc(schedule.endAt);
  const nowUtc = dayjs.utc(now);

  let slotStart = dayjs.utc(schedule.startAt);

  while (true) {
    const slotEnd = slotStart.add(durationMinutes, 'minute');

    // Half-open: the slot fits iff slotEnd <= windowEnd. The grid stops
    // the moment one more step would spill past the schedule's end.
    if (slotEnd.isAfter(scheduleEnd)) {
      break;
    }

    const slotStartDate = slotStart.toDate();
    const slotEndDate = slotEnd.toDate();

    // Past-slot rule: drop if startAt <= now. `isAfter` is strict so a
    // slot starting exactly at "now" is excluded too (consistent with
    // SCHEDULE_START_IN_PAST in F06).
    if (slotStart.isAfter(nowUtc)) {
      const intersectsBreak = scheduleHasBreak(schedule)
        ? overlapsHalfOpen(
            { startAt: slotStartDate, endAt: slotEndDate },
            { startAt: schedule.breakStartAt!, endAt: schedule.breakEndAt! },
          )
        : false;

      if (!intersectsBreak) {
        const blocked = blockingAppointments.some((appt) =>
          overlapsHalfOpen(
            { startAt: slotStartDate, endAt: slotEndDate },
            appt,
          ),
        );

        if (!blocked) {
          // F13 — drop the slot when its local wall-clock minute-of-day
          // sits outside the per-pair booking window. Either bound may
          // be null (open-ended on that side); both null = pass through.
          const localMin = localMinuteOfDay(slotStartDate);
          const inWindow = isWithinBookingWindow(
            localMin,
            bookingWindowStartMinute,
            bookingWindowEndMinute,
          );

          if (inWindow) {
            slots.push({
              startAt: slotStart.toISOString(),
              endAt: slotEnd.toISOString(),
              departmentId: schedule.departmentId,
              scheduleId: schedule.id,
            });
          }
        }
      }
    }

    slotStart = slotEnd;
  }

  return slots;
}

function scheduleHasBreak(schedule: ScheduleWindow): boolean {
  return schedule.breakStartAt !== null && schedule.breakEndAt !== null;
}

/**
 * Half-open datetime overlap: `a.startAt < b.endAt && b.startAt < a.endAt`.
 * Identical semantics to the schedule overlap rule in F06.
 */
export function overlapsHalfOpen(
  a: { startAt: Date; endAt: Date },
  b: { startAt: Date; endAt: Date },
): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}
