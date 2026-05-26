// Side-effect import to register dayjs plugins before any code in this
// module touches them. Mirrors the pattern in `appointments.service.ts`
// — unit tests bypass `main.ts` so the plugins MUST be registered here
// too. Importing twice is safe (idempotent).
import '../dayjs';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { resolveAppointmentReadScope, SCOPE } from '../auth/scope';
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
  APPOINTMENT_GROUP_DB_ORDER_BY,
  APPOINTMENT_GROUP_MEMBER_DB_ORDER_BY,
  APPOINTMENT_GROUP_STATUS,
} from './appointment-groups.const';
import type { ListAppointmentGroupsArgs } from './appointment-groups.types';
import type {
  AppointmentGroupDetailResponseDto,
  AppointmentGroupResponseDto,
} from './dto/appointment-group.response.dto';

/**
 * Shared `include` for full group + member queries (detail endpoint).
 * Defined via `Prisma.validator` so the inferred row type stays in lock
 * step with the actual query everywhere we serialise to the wire DTO.
 */
const groupDetailInclude = Prisma.validator<Prisma.AppointmentGroupInclude>()({
  appointments: {
    include: {
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
    },
    orderBy: APPOINTMENT_GROUP_MEMBER_DB_ORDER_BY,
  },
});

type GroupDetailRow = Prisma.AppointmentGroupGetPayload<{
  include: typeof groupDetailInclude;
}>;

type GroupDetailMember = GroupDetailRow['appointments'][number];

/**
 * F14 appointment-groups service. Lists / detail / close.
 *
 * Group rows are materialised LAZILY by `POST /appointments` — there is
 * NO standalone "open group" endpoint. The close action is the only
 * mutation on this surface and pairs the latest non-cancelled
 * appointment's `BOOKED → COMPLETED` transition with the group's
 * `closedAt = now()` inside a single transaction.
 *
 * Authorization re-uses `appointment.read.*` (list / detail) and
 * `appointment.update.*` (close) — F14 introduces zero new permission
 * codes per the roadmap. Scope narrowing on list / detail filters out
 * groups whose member set does not intersect the caller's scope.
 */
@Injectable()
export class AppointmentGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated list scoped to one patient. Embeds member count + a
   * latest-visit summary so the patient-detail timeline can render
   * without an extra round-trip per row.
   *
   * Scope filter is enforced via a "has at least one member visible to
   * caller" Prisma predicate (`appointments.some({ ...scope })`). Groups
   * with zero visible members are excluded.
   */
  async list(
    caller: AuthenticatedUser,
    args: ListAppointmentGroupsArgs,
  ): Promise<Paginated<AppointmentGroupResponseDto>> {
    const where: Prisma.AppointmentGroupWhereInput = {
      patientId: args.patientId,
    };

    const status = args.status ?? APPOINTMENT_GROUP_STATUS.ALL;

    if (status === APPOINTMENT_GROUP_STATUS.OPEN) {
      where.closedAt = null;
    } else if (status === APPOINTMENT_GROUP_STATUS.CLOSED) {
      where.closedAt = { not: null };
    }

    const memberScope = this.buildMemberScopeWhere(caller);

    if (memberScope === null) {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION,
        'Caller is missing the required permission(s).',
      );
    }

    where.appointments = { some: memberScope };

    const resolved = resolvePagination(args);

    const [rows, total] = await Promise.all([
      this.prisma.appointmentGroup.findMany({
        where,
        orderBy: APPOINTMENT_GROUP_DB_ORDER_BY,
        skip: resolved.skip,
        take: resolved.take,
      }),
      this.prisma.appointmentGroup.count({ where }),
    ]);

    const data = await Promise.all(rows.map((row) => this.toListResponse(row.id)));

    return buildPaginatedResponse(data, total, resolved);
  }

  /**
   * Detail lookup with full chronological member list. Out-of-scope or
   * unknown id → `404 APPOINTMENT_GROUP_NOT_FOUND` so existence does not
   * leak.
   */
  async getById(
    caller: AuthenticatedUser,
    id: string,
  ): Promise<AppointmentGroupDetailResponseDto> {
    const row = await this.prisma.appointmentGroup.findFirst({
      where: { id },
      include: groupDetailInclude,
    });

    if (!row) {
      throw AppException.notFound(
        ErrorCode.APPOINTMENT_GROUP_NOT_FOUND,
        'Appointment group not found.',
      );
    }

    if (!this.groupIntersectsScope(caller, row)) {
      throw AppException.notFound(
        ErrorCode.APPOINTMENT_GROUP_NOT_FOUND,
        'Appointment group not found.',
      );
    }

    return this.toDetailResponse(row);
  }

  /**
   * Build the per-caller `WhereInput` snippet that filters `Appointment`
   * rows down to those visible to the caller. Used in two places:
   *
   *  - list: `where.appointments = { some: <this> }` — groups with no
   *    visible members are excluded.
   *  - detail: applied as an in-memory intersection check on the loaded
   *    member list so a 404 mirrors the list filter.
   *
   * Returns `null` when the caller holds no `appointment.read.*` at all.
   */
  private buildMemberScopeWhere(
    caller: AuthenticatedUser,
  ): Prisma.AppointmentWhereInput | null {
    const scope = resolveAppointmentReadScope(caller);

    if (scope === SCOPE.ALL) {
      return {};
    }

    if (scope === SCOPE.OWN_DEPARTMENT) {
      if (caller.departmentId === null) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'Caller has no department assigned and cannot use own-department scope.',
        );
      }

      return { departmentId: caller.departmentId };
    }

    if (scope === SCOPE.OWN) {
      if (!caller.doctor) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'DOCTOR user is missing a linked Doctor record.',
        );
      }

      return { doctorId: caller.doctor.id };
    }

    return null;
  }

  /**
   * Does the loaded group have at least one member visible to the
   * caller? Mirror of the `some()` predicate above so detail-view 404
   * matches list filtering.
   */
  private groupIntersectsScope(
    caller: AuthenticatedUser,
    row: GroupDetailRow,
  ): boolean {
    const scope = resolveAppointmentReadScope(caller);

    if (scope === SCOPE.ALL) {
      return true;
    }

    if (scope === SCOPE.OWN_DEPARTMENT) {
      if (caller.departmentId === null) {
        return false;
      }

      return row.appointments.some((a) => a.departmentId === caller.departmentId);
    }

    if (scope === SCOPE.OWN) {
      if (!caller.doctor) {
        return false;
      }

      const ownDoctorId = caller.doctor.id;

      return row.appointments.some((a) => a.doctorId === ownDoctorId);
    }

    return false;
  }

  /**
   * Compose a list-row response from a freshly-loaded
   * `AppointmentGroup`. The latest-visit summary comes from a second
   * scoped query so the include set on the list is small (the list
   * doesn't need the full member set, only counts + the latest row).
   */
  private async toListResponse(
    groupId: string,
  ): Promise<AppointmentGroupResponseDto> {
    const [group, memberCount, latest] = await Promise.all([
      this.prisma.appointmentGroup.findUniqueOrThrow({
        where: { id: groupId },
      }),
      this.prisma.appointment.count({ where: { appointmentGroupId: groupId } }),
      this.prisma.appointment.findFirst({
        where: { appointmentGroupId: groupId },
        orderBy: [{ startAt: 'desc' }, { visitNumber: 'desc' }],
        include: {
          doctor: {
            select: {
              id: true,
              user: { select: { firstNameEn: true, lastNameEn: true } },
            },
          },
          department: { select: { id: true, name: true } },
        },
      }),
    ]);

    if (!latest) {
      throw AppException.notFound(
        ErrorCode.APPOINTMENT_GROUP_NOT_FOUND,
        'Appointment group has no members — should not happen.',
      );
    }

    return {
      id: group.id,
      patientId: group.patientId,
      openedAt: group.openedAt.toISOString(),
      closedAt: group.closedAt ? group.closedAt.toISOString() : null,
      memberCount,
      latestVisit: {
        appointmentId: latest.id,
        visitNumber: latest.visitNumber ?? 0,
        status: latest.status,
        startAt: latest.startAt.toISOString(),
        departmentId: latest.department.id,
        departmentName: latest.department.name,
        doctorId: latest.doctor.id,
        doctorFirstNameEn: latest.doctor.user.firstNameEn,
        doctorLastNameEn: latest.doctor.user.lastNameEn,
      },
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };
  }

  private toDetailResponse(
    row: GroupDetailRow,
  ): AppointmentGroupDetailResponseDto {
    return {
      id: row.id,
      patientId: row.patientId,
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      members: row.appointments.map((m: GroupDetailMember) => ({
        id: m.id,
        visitNumber: m.visitNumber ?? 0,
        appointmentType: m.appointmentType,
        status: m.status,
        startAt: m.startAt.toISOString(),
        endAt: m.endAt.toISOString(),
        departmentId: m.department.id,
        departmentName: m.department.name,
        doctorId: m.doctor.id,
        doctorCode: m.doctor.doctorCode,
        doctorFirstNameEn: m.doctor.user.firstNameEn,
        doctorLastNameEn: m.doctor.user.lastNameEn,
        referredToDepartmentId: m.referredToDepartmentId,
        referredAt: m.referredAt ? m.referredAt.toISOString() : null,
        referralFulfilledByAppointmentId: m.referralFulfilledByAppointmentId,
      })),
    };
  }
}
