import { Injectable } from '@nestjs/common';

import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

import type { DepartmentDoctorRow, DepartmentRow } from './departments.types';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List every active department (soft-delete excluded), name-sorted so the
   * directory output is stable across calls.
   */
  async listAll(): Promise<DepartmentRow[]> {
    const rows = await this.prisma.department.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });

    return rows;
  }

  /**
   * List doctors affiliated with a department via `doctor_departments`.
   * The `isPrimary` flag on the join row is hoisted onto each returned
   * doctor so the FE can render the "Primary" chip without a follow-up
   * lookup.
   *
   * 404 if the department id is unknown or soft-deleted.
   */
  async listDoctorsForDepartment(
    departmentId: string,
  ): Promise<DepartmentDoctorRow[]> {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, deletedAt: null },
      select: { id: true },
    });

    if (!department) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Department not found.');
    }

    const links = await this.prisma.doctorDepartment.findMany({
      where: {
        departmentId,
        deletedAt: null,
        doctor: { deletedAt: null },
      },
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
    });

    return links.map((link) => ({
      id: link.doctor.id,
      doctorCode: link.doctor.doctorCode,
      fullName:
        `${link.doctor.user.firstNameEn} ${link.doctor.user.lastNameEn}`.trim(),
      isPrimary: link.isPrimary,
    }));
  }
}
