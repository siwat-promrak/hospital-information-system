/**
 * End-to-end coverage for F08/F17 — `/medical-records` BE module.
 *
 * Mirrors the F06 / F07 suite shape: tests run against the real Nest app +
 * seeded Postgres, but the whole suite skips gracefully when the DB is
 * unreachable so CI without Docker still passes.
 *
 * F17 note: `POST /medical-records` and `PATCH /medical-records/:id` were
 * removed. Records are now written exclusively inside appointment-action
 * transactions (complete / refer / follow-up). The fixture setup creates
 * one medical record directly via Prisma so the read-only routes still
 * have data to exercise.
 *
 * What is covered:
 *  - POST /medical-records → 404 (route removed in F17)
 *  - PATCH /medical-records/:id → 404 (route removed in F17)
 *  - GET /medical-records
 *    - DOCTOR with `read.all` sees the full result set; filter narrowing
 *      by `?patientId=` / `?doctorId=` / `?appointmentId=` /
 *      `?appointmentGroupId=`.
 *    - PHARMACY (read-only) can list → 200.
 *    - Synthetic role with NO `medical_records.read.all` → 403.
 *  - GET /medical-records/:id
 *    - DOCTOR / MRO / PHARMACY → 200.
 *    - Unknown id → 404 `NOT_FOUND`.
 *  - Permanence:
 *    - `DELETE /medical-records/:id` → 404 (no route registered).
 *
 * Fixtures: per-suite scratch users / doctors / patients / schedules /
 * appointments anchored in a far-future month so test data never collides
 * with the seed dataset and the suite is order-independent.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AppointmentStatus,
  AppointmentType,
  type Appointment,
  type Department,
  type Doctor,
  type MedicalRecord,
  type Patient,
  type User,
} from '@prisma/client';
import dayjs from 'dayjs';
import type { Server } from 'node:http';
import request from 'supertest';

import '../src/dayjs';

import { ROLE } from '../src/auth/roles';
import { AppModule } from '../src/app.module';
import { ErrorCode } from '../src/common/errors';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { normalizeEmail } from '../src/common/normalize-email';
import { PrismaService } from '../src/prisma/prisma.service';

import { signTestJwt } from './utils/sign-jwt';

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'dev-nextauth-secret-change-me';

const DOCTOR_OWN_EMAIL = 'mr-doctor-own-e2e@gmail.com';
const DOCTOR_OTHER_EMAIL = 'mr-doctor-other-e2e@gmail.com';
const DOCTOR_NOROW_EMAIL = 'mr-doctor-norow-e2e@gmail.com';
const NURSE_EMAIL = 'mr-nurse-e2e@gmail.com';
const MRO_EMAIL = 'mr-mro-e2e@gmail.com';
const PHARMACY_EMAIL = 'mr-pharmacy-e2e@gmail.com';
const NOREAD_EMAIL = 'mr-noread-e2e@gmail.com';

const DEPT_NAME = 'Medical Records E2E Dept';

const SCRATCH_PATIENT_ID_PREFIX = 'mr-e2e-pid-';
const SCRATCH_ROLE_CODE_PREFIX = 'MR_E2E_NOREAD_';

interface UserWithRole {
  user: User;
  roleCode: string;
}

interface Fixtures {
  doctorOwnUser: UserWithRole;
  doctorOtherUser: UserWithRole;
  doctorNoRowUser: UserWithRole;
  doctorOwn: Doctor;
  doctorOther: Doctor;
  nurse: UserWithRole;
  mro: UserWithRole;
  pharmacy: UserWithRole;
  noReadUser: UserWithRole;
  noReadRoleId: string;
  dept: Department;
  patientOne: Patient;
  patientTwo: Patient;
  apptForDoctorOwn: Appointment;
  apptForDoctorOther: Appointment;
  medicalRecord: MedicalRecord;
  superAdminId: string;
}

async function bootstrapApp(): Promise<{ app: INestApplication; server: Server }> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();

  return { app, server: app.getHttpServer() as Server };
}

async function tryConnect(prisma: PrismaService): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return true;
  } catch {
    return false;
  }
}

/**
 * Anchor every fixture row in a far-future month so the suite is
 * deterministic regardless of when "now" is — schedules + appointments
 * stay safely in the future, never tripping the past-startAt guard.
 */
const SCRATCH_YEAR = 2099;
const SCRATCH_MONTH = 8;

function scratchDate(day: number, hour: number, minute: number = 0): Date {
  return dayjs
    .utc()
    .year(SCRATCH_YEAR)
    .month(SCRATCH_MONTH - 1)
    .date(day)
    .hour(hour)
    .minute(minute)
    .second(0)
    .millisecond(0)
    .toDate();
}

function deriveScratchHn(stamp: string): string {
  // HN format is `^[0-9]{7,9}$`; combine an 8-digit stamp from `Date.now()`
  // so reruns do not collide with the seeded 26000xxx range.
  return stamp.padStart(9, '0').slice(-9);
}

async function setupFixtures(prisma: PrismaService): Promise<Fixtures | null> {
  const doctorRole = await prisma.role.findUnique({ where: { code: ROLE.DOCTOR } });
  const nurseRole = await prisma.role.findUnique({ where: { code: ROLE.NURSE } });
  const mroRole = await prisma.role.findUnique({
    where: { code: ROLE.MEDICAL_RECORDS_OFFICER },
  });
  const pharmacyRole = await prisma.role.findUnique({ where: { code: ROLE.PHARMACY } });
  const superAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@gmail.com' },
  });

  if (!doctorRole || !nurseRole || !mroRole || !pharmacyRole || !superAdmin) {
    return null;
  }

  await teardownFixturesByNames(prisma);

  const dept = await prisma.department.create({
    data: {
      name: DEPT_NAME,
      description: 'F08 e2e scratch department',
      createdBy: superAdmin.id,
    },
  });

  const doctorOwnUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_OWN_EMAIL),
        firstNameEn: 'MROwn',
        lastNameEn: 'Doctor',
        roleId: doctorRole.id,
        departmentId: dept.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  const doctorOtherUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_OTHER_EMAIL),
        firstNameEn: 'MROther',
        lastNameEn: 'Doctor',
        roleId: doctorRole.id,
        departmentId: dept.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  // DOCTOR-role user WITHOUT a `Doctor` row — exercises the corrupt-state
  // guard in `MedicalRecordsService.create()` (rejects with 403 when
  // `caller.doctor` is null).
  const doctorNoRowUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_NOROW_EMAIL),
        firstNameEn: 'MRNoRow',
        lastNameEn: 'Doctor',
        roleId: doctorRole.id,
        departmentId: dept.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  const nurse: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(NURSE_EMAIL),
        firstNameEn: 'MR',
        lastNameEn: 'Nurse',
        roleId: nurseRole.id,
        departmentId: dept.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.NURSE,
  };

  const mro: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(MRO_EMAIL),
        firstNameEn: 'MR',
        lastNameEn: 'Officer',
        roleId: mroRole.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.MEDICAL_RECORDS_OFFICER,
  };

  const pharmacy: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(PHARMACY_EMAIL),
        firstNameEn: 'MR',
        lastNameEn: 'Pharmacy',
        roleId: pharmacyRole.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.PHARMACY,
  };

  // Synthetic role with ZERO `medical_records.*` permissions so the
  // "missing read.all" branch on GET routes is exercisable without
  // hand-editing the seeded baselines. Code is suffixed by the run stamp
  // so reruns never collide.
  const stamp = Date.now().toString(36).slice(-6);
  const noReadRole = await prisma.role.create({
    data: {
      code: `${SCRATCH_ROLE_CODE_PREFIX}${stamp}`,
      name: 'F08 e2e — no-read scratch role',
      description: 'Synthetic role with zero medical_records permissions',
      isDeletable: true,
      createdBy: superAdmin.id,
    },
  });

  const noReadUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(NOREAD_EMAIL),
        firstNameEn: 'MR',
        lastNameEn: 'NoRead',
        roleId: noReadRole.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: noReadRole.code,
  };

  const doctorStamp = Date.now().toString(36).slice(-6);

  const doctorOwn = await prisma.doctor.create({
    data: {
      userId: doctorOwnUser.user.id,
      doctorCode: `MR-OWN-${doctorStamp}`,
      identificationNo: `mr-own-${doctorStamp}`,
      medicalLicenseNo: `MED-MR-OWN-${doctorStamp}`,
      phone: '+66-2-000-1001',
      createdBy: superAdmin.id,
    },
  });

  const doctorOther = await prisma.doctor.create({
    data: {
      userId: doctorOtherUser.user.id,
      doctorCode: `MR-OTH-${doctorStamp}`,
      identificationNo: `mr-oth-${doctorStamp}`,
      medicalLicenseNo: `MED-MR-OTH-${doctorStamp}`,
      phone: '+66-2-000-1002',
      createdBy: superAdmin.id,
    },
  });

  const patientStamp = Date.now().toString();
  const patientOne = await prisma.patient.create({
    data: {
      hn: deriveScratchHn(patientStamp),
      firstNameEn: 'Praewa',
      lastNameEn: 'Boonmee',
      identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${patientStamp}-1`,
      phone: '+66-2-555-1001',
      dateOfBirth: new Date('1990-01-15T00:00:00.000Z'),
      gender: 'FEMALE',
      emergencyPersonName: 'Anan Boonmee',
      emergencyPersonRelation: 'Spouse',
      emergencyPersonPhone: '+66-2-555-1002',
      address: '123 Example Road',
      createdBy: superAdmin.id,
    },
  });

  const patientTwo = await prisma.patient.create({
    data: {
      hn: deriveScratchHn(`${patientStamp}1`),
      firstNameEn: 'Somchai',
      lastNameEn: 'Sinthorn',
      identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${patientStamp}-2`,
      phone: '+66-2-555-2001',
      dateOfBirth: new Date('1985-06-20T00:00:00.000Z'),
      gender: 'MALE',
      emergencyPersonName: 'Malee Sinthorn',
      emergencyPersonRelation: 'Mother',
      emergencyPersonPhone: '+66-2-555-2002',
      address: '456 Example Road',
      createdBy: superAdmin.id,
    },
  });

  // One schedule per doctor so appointments carry a valid `scheduleId`
  // (NOT NULL FK after the F08 schema bump). Windows live in the
  // far-future scratch month so they never overlap real seeded data.
  const scheduleOwn = await prisma.doctorSchedule.create({
    data: {
      doctorId: doctorOwn.id,
      departmentId: dept.id,
      startAt: scratchDate(1, 9),
      endAt: scratchDate(1, 12),
      createdBy: superAdmin.id,
    },
  });

  const scheduleOther = await prisma.doctorSchedule.create({
    data: {
      doctorId: doctorOther.id,
      departmentId: dept.id,
      startAt: scratchDate(2, 9),
      endAt: scratchDate(2, 12),
      createdBy: superAdmin.id,
    },
  });

  const apptForDoctorOwn = await prisma.appointment.create({
    data: {
      patientId: patientOne.id,
      doctorId: doctorOwn.id,
      departmentId: dept.id,
      scheduleId: scheduleOwn.id,
      appointmentType: AppointmentType.CONSULTATION,
      status: AppointmentStatus.BOOKED,
      startAt: scratchDate(1, 9),
      endAt: scratchDate(1, 9, 20),
      createdBy: superAdmin.id,
    },
  });

  const apptForDoctorOther = await prisma.appointment.create({
    data: {
      patientId: patientTwo.id,
      doctorId: doctorOther.id,
      departmentId: dept.id,
      scheduleId: scheduleOther.id,
      appointmentType: AppointmentType.CONSULTATION,
      status: AppointmentStatus.BOOKED,
      startAt: scratchDate(2, 9),
      endAt: scratchDate(2, 9, 20),
      createdBy: superAdmin.id,
    },
  });

  // Seed one medical record directly — POST /medical-records was removed
  // in F17 so the GET / GET :id read-only tests need data pre-seeded.
  const medicalRecord = await prisma.medicalRecord.create({
    data: {
      appointmentId: apptForDoctorOwn.id,
      doctorId: doctorOwn.id,
      patientId: patientOne.id,
      departmentId: dept.id,
      note: 'Patient presented with mild hypertension.',
      drug: 'Amlodipine 5mg once daily for 30 days.',
      createdBy: doctorOwnUser.user.id,
    },
  });

  return {
    doctorOwnUser,
    doctorOtherUser,
    doctorNoRowUser,
    doctorOwn,
    doctorOther,
    nurse,
    mro,
    pharmacy,
    noReadUser,
    noReadRoleId: noReadRole.id,
    dept,
    patientOne,
    patientTwo,
    apptForDoctorOwn,
    apptForDoctorOther,
    medicalRecord,
    superAdminId: superAdmin.id,
  };
}

async function teardownFixturesByNames(prisma: PrismaService): Promise<void> {
  const emails = [
    normalizeEmail(DOCTOR_OWN_EMAIL),
    normalizeEmail(DOCTOR_OTHER_EMAIL),
    normalizeEmail(DOCTOR_NOROW_EMAIL),
    normalizeEmail(NURSE_EMAIL),
    normalizeEmail(MRO_EMAIL),
    normalizeEmail(PHARMACY_EMAIL),
    normalizeEmail(NOREAD_EMAIL),
  ];

  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, roleId: true },
  });
  const userIds = users.map((u) => u.id);

  const doctors = await prisma.doctor.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const doctorIds = doctors.map((d) => d.id);

  const departments = await prisma.department.findMany({
    where: { name: DEPT_NAME },
    select: { id: true },
  });
  const departmentIds = departments.map((d) => d.id);

  const patients = await prisma.patient.findMany({
    where: { identificationNo: { startsWith: SCRATCH_PATIENT_ID_PREFIX } },
    select: { id: true },
  });
  const patientIds = patients.map((p) => p.id);

  // Medical records first — they FK to doctor + appointment + patient + dept.
  await prisma.medicalRecord.deleteMany({
    where: {
      OR: [
        { doctorId: { in: doctorIds } },
        { patientId: { in: patientIds } },
        { departmentId: { in: departmentIds } },
      ],
    },
  });

  await prisma.appointment.deleteMany({
    where: {
      OR: [
        { doctorId: { in: doctorIds } },
        { patientId: { in: patientIds } },
        { departmentId: { in: departmentIds } },
      ],
    },
  });

  await prisma.doctorSchedule.deleteMany({
    where: {
      OR: [
        { doctorId: { in: doctorIds } },
        { departmentId: { in: departmentIds } },
      ],
    },
  });

  await prisma.doctor.deleteMany({ where: { id: { in: doctorIds } } });

  await prisma.authLog.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { email: { in: emails } }],
    },
  });

  await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });

  // Users carry `departmentId` + `roleId` FKs, so they MUST be deleted
  // before their department + scratch role rows.
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  // Scratch synthetic role row(s) — match by code prefix so prior aborted
  // runs are also cleaned up.
  await prisma.role.deleteMany({
    where: { code: { startsWith: SCRATCH_ROLE_CODE_PREFIX } },
  });

  await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
}

describe('F08 — medical records e2e', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let fixtures: Fixtures | null = null;
  let skipReason: string | null = null;

  beforeAll(async () => {
    const bootstrap = await bootstrapApp();
    app = bootstrap.app;
    server = bootstrap.server;
    prisma = app.get(PrismaService);

    const connected = await tryConnect(prisma);

    if (!connected) {
      skipReason = 'database is not reachable — skipping e2e suite';

      return;
    }

    fixtures = await setupFixtures(prisma);

    if (!fixtures) {
      skipReason = 'seeded roles / super-admin missing — run pnpm db:seed';
    }
  });

  afterAll(async () => {
    if (fixtures) {
      await teardownFixturesByNames(prisma);
    }

    if (app) {
      await app.close();
    }
  });

  const maybe = (name: string, fn: () => Promise<void>): void => {
    it(name, async () => {
      if (skipReason) {
        // eslint-disable-next-line no-console
        console.warn(`SKIP — ${skipReason}`);

        return;
      }

      await fn();
    });
  };

  const jwtFor = async (entry: UserWithRole): Promise<string> =>
    signTestJwt(
      { userId: entry.user.id, roleCode: entry.roleCode, email: entry.user.email },
      NEXTAUTH_SECRET,
    );

  // ─── POST /medical-records — removed in F17 ──────────────────────────────

  describe('POST /medical-records (F17: route removed)', () => {
    maybe('Any request → 404 (no route registered)', async () => {
      const jwt = await jwtFor(fixtures!.doctorOwnUser);

      const res = await request(server)
        .post('/api/v1/medical-records')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patientOne.id,
          appointmentId: fixtures!.apptForDoctorOwn.id,
          note: 'F17 removed this route.',
        });

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /medical-records ─────────────────────────────────────────────────

  describe('GET /medical-records', () => {
    maybe('DOCTOR with read.all lists every matching record', async () => {
      const jwt = await jwtFor(fixtures!.doctorOwnUser);

      const res = await request(server)
        .get('/api/v1/medical-records?pageSize=100')
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);

      const ids = res.body.data.map((r: { appointmentId: string }) => r.appointmentId);
      expect(ids).toContain(fixtures!.apptForDoctorOwn.id);
    });

    maybe('?patientId= narrows correctly', async () => {
      const jwt = await jwtFor(fixtures!.doctorOwnUser);

      const res = await request(server)
        .get(`/api/v1/medical-records?patientId=${fixtures!.patientOne.id}&pageSize=100`)
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);

      for (const row of res.body.data) {
        expect(row.patientId).toBe(fixtures!.patientOne.id);
      }
    });

    maybe('?doctorId= narrows correctly', async () => {
      const jwt = await jwtFor(fixtures!.doctorOwnUser);

      const res = await request(server)
        .get(`/api/v1/medical-records?doctorId=${fixtures!.doctorOwn.id}&pageSize=100`)
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);

      for (const row of res.body.data) {
        expect(row.doctorId).toBe(fixtures!.doctorOwn.id);
      }
    });

    maybe('?appointmentId= narrows correctly', async () => {
      const jwt = await jwtFor(fixtures!.doctorOwnUser);

      const res = await request(server)
        .get(
          `/api/v1/medical-records?appointmentId=${fixtures!.apptForDoctorOwn.id}&pageSize=100`,
        )
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      // appointmentId is UNIQUE so the result is at most one row.
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].appointmentId).toBe(fixtures!.apptForDoctorOwn.id);
    });

    maybe('empty filter returns empty page when no rows match', async () => {
      const jwt = await jwtFor(fixtures!.doctorOwnUser);

      // Well-formed UUID v4 that does not match any record.
      const res = await request(server)
        .get(
          '/api/v1/medical-records?appointmentId=00000000-0000-4000-8000-000000000000',
        )
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    maybe('PHARMACY can list → 200', async () => {
      const jwt = await jwtFor(fixtures!.pharmacy);

      const res = await request(server)
        .get('/api/v1/medical-records')
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    maybe('synthetic role without medical_records.read.all → 403 INSUFFICIENT_PERMISSION', async () => {
      const jwt = await jwtFor(fixtures!.noReadUser);

      const res = await request(server)
        .get('/api/v1/medical-records')
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION);
    });
  });

  // ─── GET /medical-records/:id ─────────────────────────────────────────────

  describe('GET /medical-records/:id', () => {
    maybe('DOCTOR → 200', async () => {
      const jwt = await jwtFor(fixtures!.doctorOwnUser);
      const recordId = fixtures!.medicalRecord.id;

      const res = await request(server)
        .get(`/api/v1/medical-records/${recordId}`)
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(recordId);
    });

    maybe('MRO → 200', async () => {
      const jwt = await jwtFor(fixtures!.mro);
      const recordId = fixtures!.medicalRecord.id;

      const res = await request(server)
        .get(`/api/v1/medical-records/${recordId}`)
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(recordId);
    });

    maybe('PHARMACY → 200', async () => {
      const jwt = await jwtFor(fixtures!.pharmacy);
      const recordId = fixtures!.medicalRecord.id;

      const res = await request(server)
        .get(`/api/v1/medical-records/${recordId}`)
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(recordId);
      expect(res.body.drug).toBeDefined();
    });

    maybe('unknown id → 404 NOT_FOUND', async () => {
      const jwt = await jwtFor(fixtures!.doctorOwnUser);

      const res = await request(server)
        .get('/api/v1/medical-records/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  // ─── PATCH /medical-records/:id — removed in F17 ──────────────────────────

  describe('PATCH /medical-records/:id (F17: route removed)', () => {
    maybe('Any PATCH → 404 (no route registered)', async () => {
      const jwt = await jwtFor(fixtures!.doctorOwnUser);
      const recordId = fixtures!.medicalRecord.id;

      const res = await request(server)
        .patch(`/api/v1/medical-records/${recordId}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ note: 'F17 removed this route.' });

      expect(res.status).toBe(404);
    });
  });

  // ─── Permanence — no DELETE route ─────────────────────────────────────────

  describe('Permanence', () => {
    maybe('DELETE /medical-records/:id returns 404 from Nest (no route registered)', async () => {
      const jwt = await jwtFor(fixtures!.mro);

      // Any UUID works — the router rejects the verb before any handler
      // runs, so we don't need a real record id.
      const res = await request(server)
        .delete('/api/v1/medical-records/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(404);
    });
  });
});
