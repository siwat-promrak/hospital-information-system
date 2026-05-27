import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';

import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import {
  buildPaginatedResponse,
  resolvePagination,
  type Paginated,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import {
  assertCanActOnDoctor,
  getScopedDepartmentId,
  getScopedDoctorId,
} from './schedule.scope';
import { SCHEDULE_VERB } from './schedule.scope.const';
import {
  assertDoctorInDepartment,
  assertNoOverlap,
  assertStartAtNotInPast,
} from './schedule.validation';
import { SCHEDULE_DB_ORDER_BY } from './schedules.const';
import type { ListSchedulesArgs } from './schedules.types';
import type { CreateScheduleDto } from './dto/create-schedule.dto';
import { ScheduleResponseDto } from './dto/schedule.response.dto';
import type { UpdateScheduleDto } from './dto/update-schedule.dto';

/**
 * Shared include + select shape. Defining it via `Prisma.validator` so the
 * inferred row stays in lock-step with the actual query everywhere we
 * serialise to `ScheduleResponseDto`.
 */
const scheduleInclude = Prisma.validator<Prisma.DoctorScheduleInclude>()({
  doctor: {
    select: {
      id: true,
      doctorCode: true,
      user: {
        select: {
          firstNameEn: true,
          lastNameEn: true,
          firstNameTh: true,
          lastNameTh: true,
        },
      },
    },
  },
  department: {
    select: {
      id: true,
      name: true,
      description: true,
    },
  },
});

type ScheduleRow = Prisma.DoctorScheduleGetPayload<{
  include: typeof scheduleInclude;
}>;

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated list. STAFF / ADMIN see everything matching the filters;
   * DOCTOR is auto-restricted to their own `doctorId`. Sort is by
   * `startAt ASC` so the FE shows the closest upcoming window first.
   *
   * Date-range semantics: `from` / `to` are calendar dates (`YYYY-MM-DD`).
   * The service expands them to `[startOfDay(from), endOfDay(to)]` UTC and
   * matches schedules whose `[startAt, endAt)` intersects the range. When
   * BOTH `from` and `to` are omitted, the range defaults to the current
   * calendar month — keeps the FE's default landing page bounded.
   */
  async list(
    caller: AuthenticatedUser,
    args: ListSchedulesArgs = {},
  ): Promise<Paginated<ScheduleResponseDto>> {
    const scopedDoctorId = getScopedDoctorId(caller);
    const scopedDepartmentId = getScopedDepartmentId(caller);

    if (
      scopedDoctorId !== null &&
      args.doctorId !== undefined &&
      args.doctorId !== scopedDoctorId
    ) {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
        'DOCTOR users may only list their own schedules.',
      );
    }

    if (
      scopedDepartmentId !== null &&
      args.departmentId !== undefined &&
      args.departmentId !== scopedDepartmentId
    ) {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
        'NURSE users may only list schedules in their own department.',
      );
    }

    const where: Prisma.DoctorScheduleWhereInput = { deletedAt: null };

    const effectiveDoctorId = scopedDoctorId ?? args.doctorId;

    if (effectiveDoctorId) {
      where.doctorId = effectiveDoctorId;
    }

    const effectiveDepartmentId = scopedDepartmentId ?? args.departmentId;

    if (effectiveDepartmentId) {
      where.departmentId = effectiveDepartmentId;
    }

    const { rangeStart, rangeEnd } = resolveListRange(args.from, args.to);

    // Intersection: existing.startAt < rangeEnd AND existing.endAt > rangeStart
    where.startAt = { lt: rangeEnd };
    where.endAt = { gt: rangeStart };

    const resolved = resolvePagination(args);

    const [rows, total] = await Promise.all([
      this.prisma.doctorSchedule.findMany({
        where,
        orderBy: SCHEDULE_DB_ORDER_BY,
        include: scheduleInclude,
        skip: resolved.skip,
        take: resolved.take,
      }),
      this.prisma.doctorSchedule.count({ where }),
    ]);

    const data = rows.map((row) => this.toResponse(row));

    return buildPaginatedResponse(data, total, resolved);
  }

  /**
   * Detail lookup. Throws `404 SCHEDULE_NOT_FOUND` on miss; the same code
   * fires for "id unknown" AND "DOCTOR caller asked for someone else's
   * schedule" so probing for foreign ids does not leak existence.
   */
  async getById(
    caller: AuthenticatedUser,
    id: string,
  ): Promise<ScheduleResponseDto> {
    const row = await this.prisma.doctorSchedule.findFirst({
      where: { id, deletedAt: null },
      include: scheduleInclude,
    });

    if (!row) {
      throw AppException.notFound(
        ErrorCode.SCHEDULE_NOT_FOUND,
        'Schedule not found.',
      );
    }

    const scopedDoctorId = getScopedDoctorId(caller);

    if (scopedDoctorId !== null && scopedDoctorId !== row.doctorId) {
      throw AppException.notFound(
        ErrorCode.SCHEDULE_NOT_FOUND,
        'Schedule not found.',
      );
    }

    const scopedDepartmentId = getScopedDepartmentId(caller);

    if (
      scopedDepartmentId !== null &&
      scopedDepartmentId !== row.departmentId
    ) {
      throw AppException.notFound(
        ErrorCode.SCHEDULE_NOT_FOUND,
        'Schedule not found.',
      );
    }

    return this.toResponse(row);
  }

  /**
   * Create. Runs affiliation + overlap checks inside a Prisma transaction
   * so a concurrent write cannot slip between the read and the insert
   * (Read Committed is sufficient — the DB CHECK constraints back-stop
   * any race that bypasses our check).
   */
  async create(
    caller: AuthenticatedUser,
    dto: CreateScheduleDto,
  ): Promise<ScheduleResponseDto> {
    // Past-startAt check fires first so the user gets the clearest possible
    // error before any scope / affiliation / overlap diagnostic.
    assertStartAtNotInPast(dto.startAt);

    assertCanActOnDoctor(
      caller,
      SCHEDULE_VERB.CREATE,
      dto.doctorId,
      dto.departmentId,
    );

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const breakStartAt = dto.breakStartAt ? new Date(dto.breakStartAt) : null;
    const breakEndAt = dto.breakEndAt ? new Date(dto.breakEndAt) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      await assertDoctorInDepartment(tx, dto.doctorId, dto.departmentId);

      await assertNoOverlap(tx, {
        doctorId: dto.doctorId,
        startAt,
        endAt,
      });

      return tx.doctorSchedule.create({
        data: {
          doctorId: dto.doctorId,
          departmentId: dto.departmentId,
          startAt,
          endAt,
          breakStartAt,
          breakEndAt,
          acceptsBooking: dto.acceptsBooking ?? true,
          createdBy: caller.id,
        },
        include: scheduleInclude,
      });
    });

    return this.toResponse(row);
  }

  /**
   * Partial update. Affiliation + overlap checks re-run against the
   * MERGED row (existing + patched fields) so a single-field edit
   * (e.g. just `startAt`) is still validated against every other
   * existing schedule.
   */
  async update(
    caller: AuthenticatedUser,
    id: string,
    dto: UpdateScheduleDto,
  ): Promise<ScheduleResponseDto> {
    const existing = await this.prisma.doctorSchedule.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        doctorId: true,
        departmentId: true,
        startAt: true,
        endAt: true,
        breakStartAt: true,
        breakEndAt: true,
        acceptsBooking: true,
      },
    });

    if (!existing) {
      throw AppException.notFound(
        ErrorCode.SCHEDULE_NOT_FOUND,
        'Schedule not found.',
      );
    }

    assertCanActOnDoctor(
      caller,
      SCHEDULE_VERB.UPDATE,
      existing.doctorId,
      existing.departmentId,
    );

    await this.assertNoBlockingAppointments(id);

    const merged = {
      departmentId: dto.departmentId ?? existing.departmentId,
      startAt: dto.startAt ? new Date(dto.startAt) : existing.startAt,
      endAt: dto.endAt ? new Date(dto.endAt) : existing.endAt,
      breakStartAt:
        dto.breakStartAt === undefined
          ? existing.breakStartAt
          : new Date(dto.breakStartAt),
      breakEndAt:
        dto.breakEndAt === undefined
          ? existing.breakEndAt
          : new Date(dto.breakEndAt),
      acceptsBooking: dto.acceptsBooking ?? existing.acceptsBooking,
    };

    // Past-startAt check on the MERGED row. Catches two cases at once:
    //  1) caller is trying to move startAt into the past via the patch,
    //  2) caller is trying to edit a schedule whose existing startAt has
    //     already passed (patch may not touch startAt at all).
    assertStartAtNotInPast(merged.startAt.toISOString());

    // Cross-field invariants again on the MERGED shape — DTO validator
    // only saw the patch, not the existing row.
    if (merged.endAt <= merged.startAt) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'endAt must be strictly greater than startAt (post-merge).',
      );
    }

    const hasBreakStart = merged.breakStartAt !== null;
    const hasBreakEnd = merged.breakEndAt !== null;

    if (hasBreakStart !== hasBreakEnd) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'breakStartAt and breakEndAt must be set together (post-merge).',
      );
    }

    if (hasBreakStart && hasBreakEnd) {
      const bs = merged.breakStartAt as Date;
      const be = merged.breakEndAt as Date;

      if (bs >= be || bs < merged.startAt || be > merged.endAt) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'Break window must lie strictly inside the schedule window (post-merge).',
        );
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      await assertDoctorInDepartment(tx, existing.doctorId, merged.departmentId);

      await assertNoOverlap(
        tx,
        {
          doctorId: existing.doctorId,
          startAt: merged.startAt,
          endAt: merged.endAt,
        },
        id,
      );

      return tx.doctorSchedule.update({
        where: { id },
        data: {
          departmentId: merged.departmentId,
          startAt: merged.startAt,
          endAt: merged.endAt,
          breakStartAt: merged.breakStartAt,
          breakEndAt: merged.breakEndAt,
          acceptsBooking: merged.acceptsBooking,
          updatedBy: caller.id,
        },
        include: scheduleInclude,
      });
    });

    return this.toResponse(row);
  }

  /**
   * Soft delete — sets `deletedAt` + `deletedBy`. Idempotent: deleting an
   * already-deleted row surfaces as `404 SCHEDULE_NOT_FOUND` so the FE
   * never thinks "succeeded" for a row that was deleted by someone else
   * in the interim.
   */
  async softDelete(caller: AuthenticatedUser, id: string): Promise<void> {
    const existing = await this.prisma.doctorSchedule.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, doctorId: true, departmentId: true },
    });

    if (!existing) {
      throw AppException.notFound(
        ErrorCode.SCHEDULE_NOT_FOUND,
        'Schedule not found.',
      );
    }

    assertCanActOnDoctor(
      caller,
      SCHEDULE_VERB.DELETE,
      existing.doctorId,
      existing.departmentId,
    );

    await this.assertNoBlockingAppointments(id);

    await this.prisma.doctorSchedule.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: caller.id,
      },
    });
  }

  /**
   * Guard: reject schedule mutation (update / delete) when at least one
   * non-CANCELLED appointment (`status IN (BOOKED, COMPLETED)`) references
   * this schedule via `Appointment.scheduleId`. CANCELLED rows do NOT
   * block — they have already freed the slot back up.
   */
  private async assertNoBlockingAppointments(scheduleId: string): Promise<void> {
    const blockingCount = await this.prisma.appointment.count({
      where: {
        scheduleId,
        status: { in: [AppointmentStatus.BOOKED, AppointmentStatus.COMPLETED] },
      },
    });

    if (blockingCount > 0) {
      throw AppException.conflict(
        ErrorCode.SCHEDULE_HAS_APPOINTMENTS,
        'Cannot mutate a schedule with existing appointments.',
        { scheduleId, blockingAppointmentCount: blockingCount },
      );
    }
  }

  private toResponse(row: ScheduleRow): ScheduleResponseDto {
    return {
      id: row.id,
      doctorId: row.doctorId,
      doctor: {
        id: row.doctor.id,
        doctorCode: row.doctor.doctorCode,
        firstNameEn: row.doctor.user.firstNameEn,
        lastNameEn: row.doctor.user.lastNameEn,
        firstNameTh: row.doctor.user.firstNameTh,
        lastNameTh: row.doctor.user.lastNameTh,
      },
      departmentId: row.departmentId,
      department: {
        id: row.department.id,
        name: row.department.name,
        description: row.department.description,
      },
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      breakStartAt: row.breakStartAt ? row.breakStartAt.toISOString() : null,
      breakEndAt: row.breakEndAt ? row.breakEndAt.toISOString() : null,
      acceptsBooking: row.acceptsBooking,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/**
 * Expand the optional `from` / `to` calendar-date filters into UTC
 * datetime bounds. Defaults to the current calendar month (start of
 * 1st → end of last day, both UTC) when BOTH are omitted. Exported as
 * a closure-style function for unit-test access via the spec file.
 */
export interface ResolvedListRange {
  rangeStart: Date;
  rangeEnd: Date;
}

export function resolveListRange(
  from: string | undefined,
  to: string | undefined,
  now: Date = new Date(),
): ResolvedListRange {
  const start = from ? startOfDayUtc(from) : startOfMonthUtc(now);
  const end = to ? endOfDayUtc(to) : endOfMonthUtc(now);

  return { rangeStart: start, rangeEnd: end };
}

function startOfDayUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function endOfDayUtc(iso: string): Date {
  return new Date(`${iso}T23:59:59.999Z`);
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonthUtc(now: Date): Date {
  // Day 0 of next month is the last day of this month.
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
}
