// Side-effect import to register dayjs plugins (`utc`,
// `isSameOrBefore`, …) before any code in this module touches them.
// `main.ts` loads the same module at app boot, but unit tests bypass
// `main.ts` so the plugins MUST be registered here too. Importing the
// module twice is safe — `dayjs.extend()` is idempotent.
import '../dayjs';

import { Injectable } from '@nestjs/common';
import { BloodGroup, Prisma } from '@prisma/client';
import dayjs from 'dayjs';

import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import { normalizeEmail } from '../common/normalize-email';
import {
  buildPaginatedResponse,
  resolvePagination,
  type Paginated,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import type { CreatePatientDto } from './dto/create-patient.dto';
import { PatientResponseDto } from './dto/patient.response.dto';
import {
  PATIENT_DB_ORDER_BY,
  PATIENT_HN_LENGTH,
  PATIENT_HN_PATTERN,
} from './patients.const';
import type { ListPatientsArgs } from './patients.types';

/**
 * F09 patients service. Handles walk-in registration + the search list
 * the booking wizard's "look up patient" panel consumes.
 *
 * `hn` (Hospital Number) is minted server-side as `<YY><sequence>` —
 * `YY` is the current UTC year's last two digits, `sequence` is `max(hn
 * cast to int) + 1`. The pair is zero-padded to 8 characters. The DB
 * CHECK constraint backs `^[0-9]{7,9}$` so a generator bug is caught at
 * insert time even if the application-layer pattern slips.
 */
@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated search. `q` is case-insensitive `contains` across name
   * (en/th), phone, identification number, and HN. Missing `q` returns
   * the unfiltered list ordered by `createdAt DESC` (newest first).
   */
  async list(args: ListPatientsArgs = {}): Promise<Paginated<PatientResponseDto>> {
    const where: Prisma.PatientWhereInput = { deletedAt: null };

    if (args.q && args.q.trim().length > 0) {
      const term = args.q.trim();
      where.OR = [
        { firstNameEn: { contains: term, mode: 'insensitive' } },
        { lastNameEn: { contains: term, mode: 'insensitive' } },
        { firstNameTh: { contains: term, mode: 'insensitive' } },
        { lastNameTh: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { identificationNo: { contains: term, mode: 'insensitive' } },
        { hn: { contains: term, mode: 'insensitive' } },
      ];
    }

    const resolved = resolvePagination(args);

    const [rows, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        orderBy: PATIENT_DB_ORDER_BY,
        skip: resolved.skip,
        take: resolved.take,
      }),
      this.prisma.patient.count({ where }),
    ]);

    const data = rows.map((row) => this.toResponse(row));

    return buildPaginatedResponse(data, total, resolved);
  }

  /**
   * Retrieve a single patient by id. Throws `404 PATIENT_NOT_FOUND` when the
   * row is missing or soft-deleted.
   */
  async getById(id: string): Promise<PatientResponseDto> {
    const row = await this.prisma.patient.findFirst({
      where: { id, deletedAt: null },
    });

    if (!row) {
      throw AppException.notFound(ErrorCode.PATIENT_NOT_FOUND, 'Patient not found.');
    }

    return this.toResponse(row);
  }

  /**
   * Walk-in create. Generates `hn`, lowercases the optional email, and
   * inserts. Duplicate email → `409 PATIENT_EMAIL_EXISTS`. Audit:
   * `createdBy = caller.id`.
   */
  async create(
    caller: AuthenticatedUser,
    dto: CreatePatientDto,
  ): Promise<PatientResponseDto> {
    const email = dto.email ? normalizeEmail(dto.email) : null;

    if (email !== null) {
      const existing = await this.prisma.patient.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existing) {
        throw AppException.conflict(
          ErrorCode.PATIENT_EMAIL_EXISTS,
          'A patient with this email already exists.',
          { email },
        );
      }
    }

    const hn = await this.mintHn();

    if (!PATIENT_HN_PATTERN.test(hn)) {
      // Defence-in-depth — the generator should never produce an
      // out-of-range value. The DB CHECK is the final backstop.
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'Generated HN does not match the expected pattern.',
        { hn },
      );
    }

    try {
      const row = await this.prisma.patient.create({
        data: {
          hn,
          firstNameEn: dto.firstNameEn,
          lastNameEn: dto.lastNameEn,
          firstNameTh: dto.firstNameTh ?? null,
          lastNameTh: dto.lastNameTh ?? null,
          email,
          dateOfBirth: new Date(`${dto.dateOfBirth}T00:00:00.000Z`),
          gender: dto.gender,
          bloodGroup: dto.bloodGroup ?? BloodGroup.UNKNOWN,
          identificationNo: dto.identificationNo,
          phone: dto.phone,
          emergencyPersonName: dto.emergencyPersonName,
          emergencyPersonRelation: dto.emergencyPersonRelation,
          emergencyPersonPhone: dto.emergencyPersonPhone,
          address: dto.address,
          createdBy: caller.id,
        },
      });

      return this.toResponse(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray(err.meta?.target) &&
        (err.meta?.target as string[]).includes('email')
      ) {
        throw AppException.conflict(
          ErrorCode.PATIENT_EMAIL_EXISTS,
          'A patient with this email already exists.',
          { email },
        );
      }

      throw err;
    }
  }

  /**
   * Mint the next `hn` value. The sequence is "max numeric HN + 1",
   * zero-padded to 8 chars. The YY prefix is informational — the
   * sequence rolls forward across years (no per-year reset) so two
   * patients in consecutive years cannot collide on the same numeric
   * tail. Aligns with the seeded baseline (26000001 …).
   */
  private async mintHn(): Promise<string> {
    const latest = await this.prisma.patient.findFirst({
      orderBy: { hn: 'desc' },
      select: { hn: true },
    });

    const lastSequence = latest ? Number.parseInt(latest.hn, 10) : 0;
    const next = (Number.isFinite(lastSequence) ? lastSequence : 0) + 1;

    return next.toString().padStart(PATIENT_HN_LENGTH, '0');
  }

  private toResponse(row: Prisma.PatientGetPayload<true>): PatientResponseDto {
    return {
      id: row.id,
      hn: row.hn,
      firstNameEn: row.firstNameEn,
      lastNameEn: row.lastNameEn,
      firstNameTh: row.firstNameTh,
      lastNameTh: row.lastNameTh,
      email: row.email,
      dateOfBirth: dayjs.utc(row.dateOfBirth).format('YYYY-MM-DD'),
      gender: row.gender,
      bloodGroup: row.bloodGroup,
      identificationNo: row.identificationNo,
      phone: row.phone,
      emergencyPersonName: row.emergencyPersonName,
      emergencyPersonRelation: row.emergencyPersonRelation,
      emergencyPersonPhone: row.emergencyPersonPhone,
      address: row.address,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
