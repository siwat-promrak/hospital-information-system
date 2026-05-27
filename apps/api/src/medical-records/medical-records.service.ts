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

import { MedicalRecordResponseDto } from './dto/medical-record.response.dto';
import { MEDICAL_RECORD_DB_ORDER_BY } from './medical-records.const';
import type {
  CreateMedicalRecordInsideTxArgs,
  ListMedicalRecordsArgs,
} from './medical-records.types';

/**
 * Shared `include` for the medical-record lookups. Defining it as a
 * `Prisma.validator()` keeps the inferred row type in sync with the actual
 * query everywhere we serialise to `MedicalRecordResponseDto`.
 */
const medicalRecordInclude = Prisma.validator<Prisma.MedicalRecordInclude>()({
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
  patient: {
    select: {
      id: true,
      hn: true,
      firstNameEn: true,
      lastNameEn: true,
    },
  },
  department: {
    select: {
      id: true,
      name: true,
    },
  },
});

type MedicalRecordRow = Prisma.MedicalRecordGetPayload<{
  include: typeof medicalRecordInclude;
}>;

/**
 * F18-updated medical records service. The standalone `create()` and
 * `update()` methods have been removed. Records are now write-once and
 * authored exclusively via appointment-action endpoints (`complete`,
 * `refer`, `followUp`) which call `createInsideTx` inside their own
 * Serializable transaction.
 *
 * Remaining methods:
 *   - `list(args)` — paginated read, scope-less (gated on
 *     `medical_records.read.all`). Supports `appointmentGroupId` filter
 *     (F18 visit-thread view).
 *   - `getById(id)` — single-record detail.
 *   - `createInsideTx(tx, args)` — write-side helper called inside a
 *     caller-owned Prisma transaction; enforces the per-appointment
 *     uniqueness invariant and throws `409 MEDICAL_RECORD_ALREADY_EXISTS`
 *     on collision.
 */
@Injectable()
export class MedicalRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated list. Sort: `createdAt DESC` so the patient-detail timeline
   * reads newest-first. Reads are scope-less (gated on
   * `medical_records.read.all`) so the optional filter axes simply pass
   * through.
   *
   * F18 adds `appointmentGroupId` filtering — when set, restricts to records
   * whose linked appointment belongs to the given group (visit-thread view).
   */
  async list(args: ListMedicalRecordsArgs = {}): Promise<Paginated<MedicalRecordResponseDto>> {
    const where: Prisma.MedicalRecordWhereInput = {};

    if (args.patientId) {
      where.patientId = args.patientId;
    }

    if (args.doctorId) {
      where.doctorId = args.doctorId;
    }

    if (args.appointmentId) {
      where.appointmentId = args.appointmentId;
    }

    if (args.appointmentGroupId) {
      where.appointment = { appointmentGroupId: args.appointmentGroupId };
    }

    const resolved = resolvePagination(args);

    const [rows, total] = await Promise.all([
      this.prisma.medicalRecord.findMany({
        where,
        orderBy: MEDICAL_RECORD_DB_ORDER_BY,
        include: medicalRecordInclude,
        skip: resolved.skip,
        take: resolved.take,
      }),
      this.prisma.medicalRecord.count({ where }),
    ]);

    const data = rows.map((row) => this.toResponse(row));

    return buildPaginatedResponse(data, total, resolved);
  }

  /**
   * Detail lookup. Throws `404 NOT_FOUND` on miss.
   */
  async getById(id: string): Promise<MedicalRecordResponseDto> {
    const row = await this.prisma.medicalRecord.findFirst({
      where: { id },
      include: medicalRecordInclude,
    });

    if (!row) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Medical record not found.');
    }

    return this.toResponse(row);
  }

  /**
   * Create a medical record INSIDE an existing Prisma transaction. Called
   * by the appointment-action service methods (`complete`, `refer`,
   * `followUp`) so the record insert and the appointment state transition
   * land in the same Serializable transaction.
   *
   * Enforces the per-appointment uniqueness invariant with a pre-check
   * (`findUnique`) before the insert so the error shape is consistent with
   * the schedule-overlap convention. The DB UNIQUE constraint backs it up
   * if a race slips through.
   *
   * Does NOT return a DTO — callers serialise the appointment response
   * themselves; they do not need the medical record in the response body.
   */
  async createInsideTx(
    tx: Prisma.TransactionClient,
    args: CreateMedicalRecordInsideTxArgs,
  ): Promise<void> {
    const existing = await tx.medicalRecord.findUnique({
      where: { appointmentId: args.appointmentId },
      select: { id: true },
    });

    if (existing) {
      throw AppException.conflict(
        ErrorCode.MEDICAL_RECORD_ALREADY_EXISTS,
        'A medical record already exists for this appointment.',
        {
          appointmentId: args.appointmentId,
          existingMedicalRecordId: existing.id,
        },
      );
    }

    try {
      await tx.medicalRecord.create({
        data: {
          doctorId: args.doctorId,
          patientId: args.patientId,
          departmentId: args.departmentId,
          appointmentId: args.appointmentId,
          note: args.note,
          drug: args.drug ?? null,
          createdBy: args.createdBy,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray(err.meta?.target) &&
        (err.meta?.target as string[]).includes('appointment_id')
      ) {
        throw AppException.conflict(
          ErrorCode.MEDICAL_RECORD_ALREADY_EXISTS,
          'A medical record already exists for this appointment.',
          { appointmentId: args.appointmentId },
        );
      }

      throw err;
    }
  }

  private toResponse(row: MedicalRecordRow): MedicalRecordResponseDto {
    return {
      id: row.id,
      doctorId: row.doctorId,
      doctor: {
        id: row.doctor.id,
        doctorCode: row.doctor.doctorCode,
        firstNameEn: row.doctor.user.firstNameEn,
        lastNameEn: row.doctor.user.lastNameEn,
      },
      patientId: row.patientId,
      patient: {
        id: row.patient.id,
        hn: row.patient.hn,
        firstNameEn: row.patient.firstNameEn,
        lastNameEn: row.patient.lastNameEn,
      },
      departmentId: row.departmentId,
      department: {
        id: row.department.id,
        name: row.department.name,
      },
      appointmentId: row.appointmentId,
      note: row.note,
      drug: row.drug,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
