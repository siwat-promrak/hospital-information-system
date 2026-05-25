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
        },
        skip: resolved.skip,
        take: resolved.take,
      }),
      this.prisma.department.count({ where }),
    ]);

    return buildPaginatedResponse(rows, total, resolved);
  }
}
