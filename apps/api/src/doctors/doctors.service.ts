import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import {
  buildPaginatedResponse,
  resolvePagination,
  type Paginated,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

import {
  DoctorDepartmentAffiliationDto,
  DoctorDetailResponseDto,
  DoctorResponseDto,
} from './dto/doctor.response.dto';
import type { ListDoctorsArgs } from './doctors.types';

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
   * affiliation as primary OR secondary. An optional `q` substring filter
   * matches case-insensitively against the EN + TH name fields on the
   * linked `User` row and the `Doctor.doctorCode`; the five field matches
   * are logical-OR'd and combined with the department filter via AND.
   *
   * Sort is `doctorCode asc` for a stable directory view. Paginated — see
   * `Paginated<T>` for the envelope shape.
   */
  async listAll(args: ListDoctorsArgs = {}): Promise<Paginated<DoctorResponseDto>> {
    const where: Prisma.DoctorWhereInput = { deletedAt: null };

    if (args.departmentId) {
      where.departments = {
        some: {
          departmentId: args.departmentId,
          deletedAt: null,
        },
      };
    }

    if (args.q) {
      where.OR = [
        { user: { firstNameEn: { contains: args.q, mode: 'insensitive' } } },
        { user: { lastNameEn: { contains: args.q, mode: 'insensitive' } } },
        { user: { firstNameTh: { contains: args.q, mode: 'insensitive' } } },
        { user: { lastNameTh: { contains: args.q, mode: 'insensitive' } } },
        { doctorCode: { contains: args.q, mode: 'insensitive' } },
      ];
    }

    const resolved = resolvePagination(args);

    const [rows, total] = await Promise.all([
      this.prisma.doctor.findMany({
        where,
        orderBy: { doctorCode: 'asc' },
        include: doctorWithAffiliationsInclude,
        skip: resolved.skip,
        take: resolved.take,
      }),
      this.prisma.doctor.count({ where }),
    ]);

    const data = rows.map((row) => this.toListRow(row));

    return buildPaginatedResponse(data, total, resolved);
  }

  /**
   * Detail lookup for a single doctor. Returns `404 NOT_FOUND` if the
   * doctor is missing or soft-deleted.
   */
  async getById(id: string): Promise<DoctorDetailResponseDto> {
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

  private toListRow(row: DoctorWithAffiliations): DoctorResponseDto {
    const affiliations: DoctorDepartmentAffiliationDto[] = row.departments.map(
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
