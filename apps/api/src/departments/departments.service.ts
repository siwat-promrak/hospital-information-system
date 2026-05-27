import { Injectable } from '@nestjs/common';

import {
  APPOINTMENT_TYPE_LABEL,
  APPOINTMENT_TYPE_ORDER,
} from '../appointment-types/appointment-types.const';
import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import {
  buildPaginatedResponse,
  resolvePagination,
  type Paginated,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

import type { ListDepartmentsArgs } from './departments.types';
import type { DepartmentAppointmentTypeResponseDto } from './dto/department-appointment-type.response.dto';
import type { DepartmentResponseDto } from './dto/department.response.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List active departments (soft-delete excluded), name-sorted so the
   * directory output is stable across calls. Paginated — see
   * `Paginated<T>` for the envelope shape.
   *
   * "Doctors in a department" is served by `GET /doctors?departmentId=`
   * (see `DoctorsService.listAll`) — the previous
   * `GET /departments/:id/doctors` companion was retired to keep a single
   * canonical lookup for that view.
   */
  async listAll(args: ListDepartmentsArgs = {}): Promise<Paginated<DepartmentResponseDto>> {
    const resolved = resolvePagination(args);
    const where = { deletedAt: null };

    const [rows, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          // Pull the join rows for the booking wizard's type filter.
          // Soft-deleted join rows are filtered out so a retired
          // `(departmentId, appointmentType)` pair stops being offered.
          allowedAppointmentTypes: {
            where: { deletedAt: null },
            select: { appointmentType: true },
          },
        },
        skip: resolved.skip,
        take: resolved.take,
      }),
      this.prisma.department.count({ where }),
    ]);

    // Flatten the join rows to a plain `AppointmentType[]` so the wire
    // shape mirrors `DepartmentResponseDto` exactly. The DB rows arrive
    // sorted by id (Prisma default) — sort the result alphabetically by
    // enum value so two equivalent department rows always serialise the
    // same array order (stable response shape across instances).
    const data: DepartmentResponseDto[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      allowedAppointmentTypes: row.allowedAppointmentTypes
        .map((join) => join.appointmentType)
        .sort(),
    }));

    return buildPaginatedResponse(data, total, resolved);
  }

  /**
   * F13 — list the per-(department, type) booking rules for one
   * department. Returns one row per `department_appointment_types` entry
   * with the per-pair `durationMinutes` + nullable booking window. The
   * booking wizard fetches this catalog after the user picks a
   * department so its type chip can render the window copy.
   *
   * Single round-trip: one `findFirst` on `Department` that includes the
   * join rows in the same query.
   *
   * Out-of-scope semantics:
   *  - Department not found / soft-deleted → `404 NOT_FOUND`.
   *
   * The endpoint's permission gate (any-of `appointment.read.*`) is
   * enforced by the route's `@RequirePermission(...)`; this method
   * does NOT narrow by caller scope — the catalog itself is not
   * sensitive data.
   */
  async listAppointmentTypes(
    departmentId: string,
  ): Promise<DepartmentAppointmentTypeResponseDto[]> {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, deletedAt: null },
      select: {
        id: true,
        allowedAppointmentTypes: {
          where: { deletedAt: null },
          select: {
            appointmentType: true,
            durationMinutes: true,
            windows: {
              where: { deletedAt: null },
              select: { startMinute: true, endMinute: true },
              orderBy: { startMinute: 'asc' },
            },
          },
        },
      },
    });

    if (!department) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Department not found.');
    }

    // Index by enum value so the response can be ordered using the same
    // canonical `APPOINTMENT_TYPE_ORDER` the global label catalog uses.
    const rowByCode = new Map(
      department.allowedAppointmentTypes.map((row) => [row.appointmentType, row]),
    );

    const data: DepartmentAppointmentTypeResponseDto[] = [];

    for (const code of APPOINTMENT_TYPE_ORDER) {
      const row = rowByCode.get(code);

      if (!row) {
        continue;
      }

      data.push({
        code,
        label: APPOINTMENT_TYPE_LABEL[code],
        durationMinutes: row.durationMinutes,
        bookingWindows: row.windows,
      });
    }

    return data;
  }
}
