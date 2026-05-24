import { Injectable } from '@nestjs/common';

import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import {
  buildPaginatedResponse,
  resolvePagination,
  type Paginated,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

import type {
  DepartmentDoctorRow,
  DepartmentRow,
  ListDepartmentsArgs,
  ListDepartmentDoctorsArgs,
} from './departments.types';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List active departments (soft-delete excluded), name-sorted so the
   * directory output is stable across calls. Paginated — see
   * `Paginated<T>` for the envelope shape.
   */
  async listAll(args: ListDepartmentsArgs = {}): Promise<Paginated<DepartmentRow>> {
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

  /**
   * List doctors affiliated with a department via `doctor_departments`.
   * The `isPrimary` flag on the join row is hoisted onto each returned
   * doctor so the FE can render the "Primary" chip without a follow-up
   * lookup. Sorted with primaries first, then by `doctorCode asc`.
   *
   * 404 if the department id is unknown or soft-deleted.
   */
  async listDoctorsForDepartment(
    departmentId: string,
    args: ListDepartmentDoctorsArgs = {},
  ): Promise<Paginated<DepartmentDoctorRow>> {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, deletedAt: null },
      select: { id: true },
    });

    if (!department) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Department not found.');
    }

    const resolved = resolvePagination(args);
    const where = {
      departmentId,
      deletedAt: null,
      doctor: { deletedAt: null },
    };

    const [links, total] = await Promise.all([
      this.prisma.doctorDepartment.findMany({
        where,
        orderBy: [{ isPrimary: 'desc' }, { doctor: { doctorCode: 'asc' } }],
        select: {
          isPrimary: true,
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
        },
        skip: resolved.skip,
        take: resolved.take,
      }),
      this.prisma.doctorDepartment.count({ where }),
    ]);

    const data: DepartmentDoctorRow[] = links.map((link) => ({
      id: link.doctor.id,
      doctorCode: link.doctor.doctorCode,
      fullName:
        `${link.doctor.user.firstNameEn} ${link.doctor.user.lastNameEn}`.trim(),
      isPrimary: link.isPrimary,
    }));

    return buildPaginatedResponse(data, total, resolved);
  }
}
