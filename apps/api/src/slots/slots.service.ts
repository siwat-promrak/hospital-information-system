// Side-effect import to register dayjs plugins (`utc`, `isSameOrBefore`,
// `isSameOrAfter`, …) before any code in this module touches them.
// `main.ts` loads the same module at app boot, but unit tests bypass
// `main.ts` so the plugins MUST be registered here too. Importing the
// module twice is safe — `dayjs.extend()` is idempotent.
import '../dayjs';

import { Injectable } from '@nestjs/common';
import { AppointmentType } from '@prisma/client';
import dayjs from 'dayjs';

import { APPOINTMENT_TYPE_DURATION_MINUTES } from '../appointment-types/appointment-types.const';
import { PERMISSION } from '../auth/permissions';
import { resolveAppointmentWriteScope, SCOPE } from '../auth/scope';
import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import { BLOCKING_APPOINTMENT_STATUSES, SLOT_ERROR_CODE } from './slots.const';
import type {
  ComputeScheduleSlotsArgs,
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
 *     DEPARTMENT_TYPE_NOT_ALLOWED`).
 *  2. **Fetch the day's working windows**: every active (non-soft-deleted)
 *     `DoctorSchedule` for `(doctorId, departmentId)` whose
 *     `[startAt, endAt)` intersects the UTC calendar day, AND whose
 *     `acceptsBooking = true`. Each schedule contributes its own slot grid.
 *  3. **Step the grid + apply exclusions**: for each schedule, step
 *     `[startAt, endAt)` by `APPOINTMENT_TYPE_DURATION_MINUTES[type]`,
 *     yielding `[step, step + duration)` slots. Exclude any slot that
 *     - intersects the schedule's break window (when set), OR
 *     - intersects an appointment on that doctor that day with status
 *       `BOOKED` or `COMPLETED` (CANCELLED frees the slot — there is no
 *       tombstone column on `Appointment`), OR
 *     - starts at or before `now` (server `dayjs.utc()`).
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
    await this.assertScope(caller, args.departmentId);
    await this.assertDoctorExists(args.doctorId);
    await this.assertDepartmentAllowsType(args.departmentId, args.type);

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

    const blockingAppointments = await this.prisma.appointment.findMany({
      where: {
        doctorId: args.doctorId,
        status: { in: [...BLOCKING_APPOINTMENT_STATUSES] },
        // Day-narrowed for index efficiency; the per-slot overlap check is
        // still half-open. Use the same day bounds as the schedule fetch.
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
    });

    const now = dayjs.utc();
    const durationMinutes = APPOINTMENT_TYPE_DURATION_MINUTES[args.type];

    const slots: SlotResult[] = [];

    for (const schedule of schedules) {
      const scheduleSlots = computeSchedulesSlots({
        schedule,
        durationMinutes,
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
   * Honor the scope encoded on the caller's
   * `appointment.create.own-department` permission: a NURSE may only
   * probe slots for doctors in their own department. ADMIN /
   * MEDICAL_RECORDS_OFFICER / PHARMACY hit the route-permission guard
   * (`403 INSUFFICIENT_PERMISSION`) before this method runs.
   *
   * Future `appointment.create.all` callers (if the catalog grows one)
   * would short-circuit on the `ALL` branch.
   */
  private async assertScope(
    caller: AuthenticatedUser,
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

    throw AppException.forbidden(
      ErrorCode.INSUFFICIENT_PERMISSION,
      'Caller is missing the required permission(s).',
      {
        required: [PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT],
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

  private async assertDepartmentAllowsType(
    departmentId: string,
    appointmentType: AppointmentType,
  ): Promise<void> {
    const link = await this.prisma.departmentAppointmentType.findFirst({
      where: {
        departmentId,
        appointmentType,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!link) {
      throw AppException.badRequest(
        SLOT_ERROR_CODE.DEPARTMENT_TYPE_NOT_ALLOWED,
        'Department does not offer this appointment type.',
        { departmentId, appointmentType },
      );
    }
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
  const { schedule, durationMinutes, blockingAppointments, now } = args;
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
          slots.push({
            startAt: slotStart.toISOString(),
            endAt: slotEnd.toISOString(),
            departmentId: schedule.departmentId,
            scheduleId: schedule.id,
          });
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
