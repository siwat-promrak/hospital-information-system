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
  DoctorDetailResponseDto,
  DoctorResponseDto,
} from './dto/doctor.response.dto';
import type { ListDoctorsArgs } from './doctors.types';

/**
 * Shared `include` for the doctor lookups. Declared once so the inferred
 * row shape stays in sync with the actual query everywhere we use it.
 *
 * Post the Item-3 centralisation, `User.departmentId` is the SINGLE source
 * of truth for the doctor's home department — `Doctor` no longer carries
 * its own `department_id` column or `Department` relation. The include
 * walks `Doctor → User → Department` to fetch the dept shape the
 * `DoctorResponseDto` echoes on the wire (`departmentId`, `department.id`,
 * `department.name`).
 */
const doctorWithDepartmentInclude = Prisma.validator<Prisma.DoctorInclude>()({
  user: {
    select: {
      firstNameEn: true,
      lastNameEn: true,
      departmentId: true,
      department: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
        },
      },
    },
  },
});

type DoctorWithDepartment = Prisma.DoctorGetPayload<{
  include: typeof doctorWithDepartmentInclude;
}>;

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List active doctors with their department. Optionally filter to a
   * single department via the doctor's linked `User.departmentId` (post
   * the Item-3 centralisation — `Doctor` no longer carries its own
   * department column). An optional `q` substring filter matches
   * case-insensitively against the EN + TH name fields on the linked
   * `User` row and the `Doctor.doctorCode`; the five field matches are
   * logical-OR'd and combined with the department filter via AND.
   *
   * Sort is `doctorCode asc` for a stable directory view. Paginated — see
   * `Paginated<T>` for the envelope shape.
   */
  async listAll(args: ListDoctorsArgs = {}): Promise<Paginated<DoctorResponseDto>> {
    const where: Prisma.DoctorWhereInput = { deletedAt: null };

    if (args.departmentId) {
      // Post-Item-3 the doctor's department lives on `User.departmentId` —
      // filter through the user relation rather than a flat column.
      where.user = { departmentId: args.departmentId };
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
        include: doctorWithDepartmentInclude,
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
      include: doctorWithDepartmentInclude,
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

  private toListRow(row: DoctorWithDepartment): DoctorResponseDto {
    // Post-Item-3: source the doctor's department from `user.department` —
    // `Doctor` no longer carries a `department_id` column. The wire-side
    // `DoctorResponseDto.departmentId` + `DoctorResponseDto.department`
    // contract is preserved by echoing the user-side values verbatim. The
    // `user.department` join is nullable on the User side (ADMIN / MRO /
    // PHARMACY may have no department), but a DOCTOR row's matching User
    // MUST carry one per the DTO invariant — fall back to empty / TBD
    // values defensively so a malformed DB row surfaces as a 500 rather
    // than a corrupt cache.
    if (!row.user.department) {
      throw new Error(
        `Doctor ${row.id} has no department on its linked User row — invariant violation`,
      );
    }

    return {
      id: row.id,
      doctorCode: row.doctorCode,
      firstNameEn: row.user.firstNameEn,
      lastNameEn: row.user.lastNameEn,
      fullName: `${row.user.firstNameEn} ${row.user.lastNameEn}`.trim(),
      gender: row.gender,
      departmentId: row.user.department.id,
      department: {
        id: row.user.department.id,
        name: row.user.department.name,
      },
    };
  }
}
