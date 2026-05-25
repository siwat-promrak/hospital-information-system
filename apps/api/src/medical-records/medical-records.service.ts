import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  resolveMedicalRecordsUpdateScope,
  SCOPE,
} from '../auth/scope';
import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import {
  buildPaginatedResponse,
  resolvePagination,
  type Paginated,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import type { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { MedicalRecordResponseDto } from './dto/medical-record.response.dto';
import type { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';
import { MEDICAL_RECORD_DB_ORDER_BY } from './medical-records.const';
import type { ListMedicalRecordsArgs } from './medical-records.types';

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
 * F11-prep medical records service. The `medical_records` table is
 * permanent (no soft-delete column) — there is no `delete()` method by
 * design.
 *
 * Scope semantics:
 *   - `medical_records.read.all`     → list / detail are unscoped.
 *   - `medical_records.create.own`   → DOCTOR-only; service writes
 *     `doctorId = caller.doctor.id` from the JWT, NOT the request body.
 *   - `medical_records.update.own`   → DOCTOR can only update records
 *     they authored.
 *   - `medical_records.update.all`   → MEDICAL_RECORDS_OFFICER may
 *     update any record.
 */
@Injectable()
export class MedicalRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated list. Sort: `createdAt DESC` so the patient-detail timeline
   * reads newest-first. Reads are scope-less (gated on
   * `medical_records.read.all`) so the optional filter axes simply pass
   * through.
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
   * Create. Pinned to a single doctor — `doctorId` is read from the
   * caller's JWT (`caller.doctor.id`), NOT from the request body, so a
   * DOCTOR cannot author a record as someone else.
   *
   * The associated `appointment` is loaded so the service can:
   *   1. assert the appointment exists (404 NOT_FOUND on miss), AND
   *   2. mirror the appointment's `departmentId` onto the record (denorm
   *      cache like `DoctorSchedule` / `Appointment`).
   *
   * If the caller's `doctor.id` does not match the appointment's
   * `doctorId`, reject with `403 INSUFFICIENT_PERMISSION_SCOPE` — the
   * `.create.own` permission means "I am the authoring doctor", and the
   * authoring doctor MUST be the doctor on the appointment.
   */
  async create(
    caller: AuthenticatedUser,
    dto: CreateMedicalRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    if (!caller.doctor) {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
        'Only DOCTOR users may author medical records.',
      );
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: { id: dto.appointmentId },
      select: {
        id: true,
        doctorId: true,
        departmentId: true,
        patientId: true,
      },
    });

    if (!appointment) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Appointment not found.');
    }

    if (appointment.doctorId !== caller.doctor.id) {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
        'DOCTOR users may only author medical records for their own appointments.',
      );
    }

    if (appointment.patientId !== dto.patientId) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'patientId must match the patient on the referenced appointment.',
      );
    }

    const row = await this.prisma.medicalRecord.create({
      data: {
        doctorId: caller.doctor.id,
        patientId: dto.patientId,
        departmentId: appointment.departmentId,
        appointmentId: appointment.id,
        note: dto.note,
        drug: dto.drug ?? null,
        createdBy: caller.id,
      },
      include: medicalRecordInclude,
    });

    return this.toResponse(row);
  }

  /**
   * Partial update. Scope branches:
   *   - `MEDICAL_RECORDS_UPDATE_ALL` → no further check, write through.
   *   - `MEDICAL_RECORDS_UPDATE_OWN` → row's `doctorId` MUST equal the
   *      caller's `caller.doctor.id`; otherwise 403
   *      `INSUFFICIENT_PERMISSION_SCOPE`.
   */
  async update(
    caller: AuthenticatedUser,
    id: string,
    dto: UpdateMedicalRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    const existing = await this.prisma.medicalRecord.findFirst({
      where: { id },
      select: { id: true, doctorId: true },
    });

    if (!existing) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Medical record not found.');
    }

    const scope = resolveMedicalRecordsUpdateScope(caller);

    if (scope === SCOPE.OWN) {
      if (!caller.doctor || caller.doctor.id !== existing.doctorId) {
        throw AppException.forbidden(
          ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
          'DOCTOR users may only update medical records they authored.',
        );
      }
    } else if (scope !== SCOPE.ALL) {
      // Route guard already required one of the two perms — defensive
      // fail-closed for an unexpected catalog gap.
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION,
        'Caller is missing the required permission(s).',
      );
    }

    const data: Prisma.MedicalRecordUncheckedUpdateInput = { updatedBy: caller.id };

    if (dto.note !== undefined) {
      data.note = dto.note;
    }

    if (dto.drug !== undefined) {
      data.drug = dto.drug;
    }

    const row = await this.prisma.medicalRecord.update({
      where: { id },
      data,
      include: medicalRecordInclude,
    });

    return this.toResponse(row);
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
