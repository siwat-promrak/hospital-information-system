import { Injectable } from '@nestjs/common';

import {
  buildPaginatedResponse,
  resolvePagination,
  type Paginated,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

import type { ListDepartmentsArgs } from './departments.types';
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
}
