// Side-effect import to register dayjs plugins (`utc`,
// `isSameOrBefore`, …) before any code in this module touches them.
// `main.ts` loads the same module at app boot, but unit tests bypass
// `main.ts` so the plugins MUST be registered here too. Importing the
// module twice is safe — `dayjs.extend()` is idempotent.
import '../dayjs';

import type { Prisma } from '@prisma/client';
import dayjs from 'dayjs';

import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';

/**
 * **Service-layer / domain** validation helpers for F06 schedule writes.
 *
 * These run inside `SchedulesService` AFTER the global `ValidationPipe`
 * has accepted the DTO. They cover checks that need a Prisma transaction,
 * a "now" comparison via `dayjs.utc()`, or domain knowledge that doesn't
 * belong on the DTO. The **DTO-layer / structural** counterpart lives at
 * `./decorators/schedule-window.decorator.ts` (`@IsScheduleWindowValid()`) and
 * covers cross-field shape rules (`endAt > startAt`, break paired + inside
 * the working window).
 *
 *  - `overlapsWindow` is a pure datetime-arithmetic check, exposed for
 *    unit tests so the time-overlap rule does not need a Prisma
 *    round-trip. Schedules carry their own absolute datetimes — overlap
 *    is `a.startAt < b.endAt && b.startAt < a.endAt`.
 *  - `assertStartAtNotInPast` enforces the "no creating / editing into
 *    the past" rule. Pure — uses `dayjs.utc()` for the now-comparison
 *    (Rule 9) so it is trivially unit-testable with `jest.useFakeTimers`.
 *  - `assertDoctorInDepartment` re-runs the `doctor_departments` lookup
 *    on every write so a soft-deleted affiliation immediately invalidates
 *    pending writes.
 *  - `assertNoOverlap` performs the Prisma read + arithmetic check.
 *
 * Every `assert*` helper throws the canonical `AppException` so the
 * service can call them in any order without wrapping.
 */

/**
 * Half-open datetime-window overlap. Two windows overlap iff each starts
 * strictly before the other ends. Back-to-back schedules (one ends at
 * 12:00, next starts at 12:00) do NOT overlap.
 */
export function overlapsWindow(
  a: { startAt: Date; endAt: Date },
  b: { startAt: Date; endAt: Date },
): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

/**
 * Throws `400 SCHEDULE_START_IN_PAST` when `startAtIso` is at or before
 * `dayjs.utc()`. Used on BOTH create AND update (against the merged row),
 * so the same rule catches:
 *
 *  - "user is creating a schedule whose start is in the past", AND
 *  - "user is editing a schedule whose start has already passed" (the
 *    merged `startAt` is the existing value when the patch omits it, so
 *    a past-startAt row trips the guard on ANY edit).
 *
 * The DB CHECK constraint cannot enforce "future" because it has no
 * `now` reference — this service-layer guard is the source of truth for
 * the rule.
 */
export function assertStartAtNotInPast(startAtIso: string): void {
  const startAt = dayjs.utc(startAtIso);
  const now = dayjs.utc();

  if (startAt.isSameOrBefore(now)) {
    throw AppException.badRequest(
      ErrorCode.SCHEDULE_START_IN_PAST,
      'Schedule start time cannot be in the past.',
      { startAt: startAtIso, now: now.toISOString() },
    );
  }
}

/**
 * Throws `400 DOCTOR_DEPARTMENT_MISMATCH` unless the doctor's current
 * `User.departmentId` equals the supplied `departmentId`. Post the Item-3
 * centralisation, `User.departmentId` is the SINGLE source of truth for a
 * doctor's home department — `Doctor` no longer carries its own column.
 * The schedule row still stores a denormalised copy of the dept id (see
 * `DoctorSchedule.departmentId`), so the validator asserts equality rather
 * than membership.
 *
 * Caller passes a Prisma transaction client so the doctor read happens
 * inside the surrounding tx along with the overlap check + write.
 */
export async function assertDoctorInDepartment(
  tx: Prisma.TransactionClient,
  doctorId: string,
  departmentId: string,
): Promise<void> {
  const doctor = await tx.doctor.findFirst({
    where: { id: doctorId, deletedAt: null },
    select: { user: { select: { departmentId: true } } },
  });

  if (!doctor) {
    throw AppException.conflict(
      ErrorCode.DOCTOR_NOT_IN_DEPARTMENT,
      'Doctor is not affiliated with the requested department.',
      { doctorId, departmentId },
    );
  }

  const doctorDepartmentId = doctor.user.departmentId;

  if (doctorDepartmentId !== departmentId) {
    throw AppException.badRequest(
      ErrorCode.DOCTOR_DEPARTMENT_MISMATCH,
      "Schedule departmentId must match the doctor's current department.",
      {
        doctorId,
        requestedDepartmentId: departmentId,
        doctorDepartmentId,
      },
    );
  }
}

/**
 * Throws `409 SCHEDULE_OVERLAP` if any OTHER active schedule for the same
 * `doctorId` shares a datetime window with `candidate`. `excludeId` is
 * omitted on create and set to the current row id on update so a
 * schedule never collides with itself.
 *
 * The DB query is narrowed by `(startAt < candidate.endAt AND endAt >
 * candidate.startAt)` so we only fetch siblings that actually intersect
 * the candidate range — Postgres can hit the `start_at` index for the
 * upper bound. The arithmetic in-memory check then confirms (and
 * tests can stub `findMany` to exercise the same algebra).
 */
export interface ScheduleOverlapCandidate {
  doctorId: string;
  startAt: Date;
  endAt: Date;
}

export async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  candidate: ScheduleOverlapCandidate,
  excludeId?: string,
): Promise<void> {
  const siblings = await tx.doctorSchedule.findMany({
    where: {
      doctorId: candidate.doctorId,
      deletedAt: null,
      startAt: { lt: candidate.endAt },
      endAt: { gt: candidate.startAt },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
    },
  });

  for (const sibling of siblings) {
    if (!overlapsWindow(candidate, sibling)) {
      continue;
    }

    throw AppException.conflict(
      ErrorCode.SCHEDULE_OVERLAP,
      'Schedule conflicts with an existing active schedule for the same doctor.',
      { conflictingScheduleId: sibling.id },
    );
  }
}
