import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

import type {
  DoctorDepartmentAffiliation,
  DoctorDetailRow,
  DoctorListRow,
} from './doctors.types';

/**
 * Shared `include` for the doctor lookups. Declared once so the inferred
 * row shape stays in sync with the actual query everywhere we use it.
 */
const doctorWithAffiliationsInclude = Prisma.validator<Prisma.DoctorInclude>()({
  user: {
    select: {
      firstNameEn: true,
      lastNameEn: true,
    },
  },
  departments: {
    where: {
      deletedAt: null,
      department: { deletedAt: null },
    },
    orderBy: { isPrimary: 'desc' },
    select: {
      isPrimary: true,
      department: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
});

type DoctorWithAffiliations = Prisma.DoctorGetPayload<{
  include: typeof doctorWithAffiliationsInclude;
}>;

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List active doctors with their department affiliations. Optionally
   * filter to a single department — the filter joins through
   * `doctor_departments` so a doctor still surfaces if they hold the
   * affiliation as primary OR secondary.
   *
   * Sort is `doctorCode asc` for a stable directory view.
   */
  async listAll(filter?: { departmentId?: string }): Promise<DoctorListRow[]> {
    const where: Prisma.DoctorWhereInput = { deletedAt: null };

    if (filter?.departmentId) {
      where.departments = {
        some: {
          departmentId: filter.departmentId,
          deletedAt: null,
        },
      };
    }

    const rows = await this.prisma.doctor.findMany({
      where,
      orderBy: { doctorCode: 'asc' },
      include: doctorWithAffiliationsInclude,
    });

    return rows.map((row) => this.toListRow(row));
  }

  /**
   * Detail lookup for a single doctor. Returns `404 NOT_FOUND` if the
   * doctor is missing or soft-deleted.
   */
  async getById(id: string): Promise<DoctorDetailRow> {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id, deletedAt: null },
      include: doctorWithAffiliationsInclude,
    });

    if (!doctor) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Doctor not found.');
    }

    const scheduleCount = await this.prisma.doctorSchedule.count({
      where: { doctorId: id, deletedAt: null },
    });

    return {
      ...this.toListRow(doctor),
      phone: doctor.phone,
      medicalLicenseNo: doctor.medicalLicenseNo,
      address: doctor.address,
      scheduleCount,
    };
  }

  private toListRow(row: DoctorWithAffiliations): DoctorListRow {
    const affiliations: DoctorDepartmentAffiliation[] = row.departments.map(
      (link) => ({
        departmentId: link.department.id,
        departmentName: link.department.name,
        isPrimary: link.isPrimary,
      }),
    );

    return {
      id: row.id,
      doctorCode: row.doctorCode,
      firstNameEn: row.user.firstNameEn,
      lastNameEn: row.user.lastNameEn,
      fullName: `${row.user.firstNameEn} ${row.user.lastNameEn}`.trim(),
      gender: row.gender,
      departments: affiliations,
    };
  }
}
