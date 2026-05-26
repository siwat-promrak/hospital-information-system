/**
 * End-to-end coverage for F09 — `/appointments` BE module.
 *
 * Tests run against the real Nest app + seeded Postgres, but the whole
 * suite skips gracefully when the DB is unreachable so CI without
 * Docker still passes.
 *
 * What is covered:
 *  - POST /appointments
 *    - Happy NURSE booking → 201.
 *    - Happy DOCTOR self-booking (`.own`) → 201.
 *    - Duplicate slot → 409 SLOT_TAKEN.
 *    - `(department, type)` mismatch → 400 DEPARTMENT_TYPE_NOT_ALLOWED.
 *    - Doctor home dept mismatch → 400 DOCTOR_DEPARTMENT_MISMATCH.
 *    - Past startAt → 400 APPOINTMENT_START_IN_PAST.
 *    - PROCEDURE without reason → 400 VALIDATION_FAILED.
 *    - PROCEDURE with reason → 201.
 *    - Slot outside schedule → 400 SLOT_OUTSIDE_SCHEDULE.
 *    - Schedule not bookable (`acceptsBooking=false`) → 400
 *      SCHEDULE_NOT_BOOKABLE.
 *    - NURSE booking in foreign dept → 403 INSUFFICIENT_PERMISSION_SCOPE.
 *    - DOCTOR booking for foreign doctor → 403 INSUFFICIENT_PERMISSION_SCOPE.
 *  - GET /appointments
 *    - NURSE narrowed to own dept; DOCTOR narrowed to own doctor; MRO
 *      sees all.
 *    - List filter outside scope (NURSE explicit `?departmentId=<foreign>`)
 *      → 403 INSUFFICIENT_PERMISSION_SCOPE.
 *  - GET /appointments/:id
 *    - Out-of-scope row → 404 APPOINTMENT_NOT_FOUND.
 *  - POST /appointments/:id/cancel
 *    - Happy cancel → slot is freed (re-book same slot returns 201).
 *    - Already-cancelled → 409 APPOINTMENT_ALREADY_CANCELLED.
 *    - Scope violation (NURSE on foreign dept) → 403.
 *
 * Fixtures: per-suite scratch users / doctors / patients / schedules
 * anchored in a far-future month so test data never collides with the
 * seed dataset.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AppointmentType,
  type Department,
  type Doctor,
  type DoctorSchedule,
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

const NURSE_HOME_EMAIL = 'appt-nurse-home-e2e@gmail.com';
const NURSE_FOREIGN_EMAIL = 'appt-nurse-foreign-e2e@gmail.com';
const DOCTOR_USER_EMAIL = 'appt-doctor-e2e@gmail.com';
const DOCTOR_OTHER_USER_EMAIL = 'appt-doctor-other-e2e@gmail.com';
const MRO_EMAIL = 'appt-mro-e2e@gmail.com';

const DEPT_HOME_NAME = 'Appt E2E Home Dept';
const DEPT_FOREIGN_NAME = 'Appt E2E Foreign Dept';

const SCRATCH_PATIENT_ID_PREFIX = 'appt-e2e-pid-';

const SCRATCH_YEAR = 2099;
const SCRATCH_MONTH = 9;

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

function scratchIso(day: number, hour: number, minute: number = 0): string {
  return scratchDate(day, hour, minute).toISOString();
}

function deriveScratchHn(stamp: string): string {
  return stamp.padStart(9, '0').slice(-9);
}

interface UserWithRole {
  user: User;
  roleCode: string;
}

interface Fixtures {
  nurseHome: UserWithRole;
  nurseForeign: UserWithRole;
  doctorUser: UserWithRole;
  doctorOtherUser: UserWithRole;
  mro: UserWithRole;
  doctor: Doctor;
  doctorOther: Doctor;
  deptHome: Department;
  deptForeign: Department;
  patient: Patient;
  patientForeign: Patient;
  scheduleHome: DoctorSchedule;
  scheduleForeign: DoctorSchedule;
  scheduleHomeBreak: DoctorSchedule;
  scheduleHomeNoBook: DoctorSchedule;
  scheduleHomeProcedure: DoctorSchedule;
  scheduleHomeF13: DoctorSchedule;
  superAdminId: string;
}

async function bootstrapApp(): Promise<{
  app: INestApplication;
  server: Server;
}> {
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

async function setupFixtures(prisma: PrismaService): Promise<Fixtures | null> {
  const nurseRole = await prisma.role.findUnique({ where: { code: ROLE.NURSE } });
  const doctorRole = await prisma.role.findUnique({ where: { code: ROLE.DOCTOR } });
  const mroRole = await prisma.role.findUnique({
    where: { code: ROLE.MEDICAL_RECORDS_OFFICER },
  });
  const superAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@gmail.com' },
  });

  if (!nurseRole || !doctorRole || !mroRole || !superAdmin) {
    return null;
  }

  await teardownFixturesByNames(prisma);

  const deptHome = await prisma.department.create({
    data: {
      name: DEPT_HOME_NAME,
      description: 'F09 appointments e2e — home dept',
      createdBy: superAdmin.id,
    },
  });

  const deptForeign = await prisma.department.create({
    data: {
      name: DEPT_FOREIGN_NAME,
      description: 'F09 appointments e2e — foreign dept',
      createdBy: superAdmin.id,
    },
  });

  // Allow CONSULTATION + PROCEDURE + FOLLOW_UP in home; only CONSULTATION
  // in foreign so the (dept, type) mismatch test has a real foreign type
  // to send against home.
  //
  // F13 — durations mirror the pre-F13 defaults EXCEPT `(deptHome,
  // PROCEDURE)` which is the per-pair override (90 min) so the
  // duration-drives-endAt assertion is meaningful. The booking-window
  // tests below add a separate (deptHome, FOLLOW_UP) window.
  //
  // The 09:00–12:00 local window matches a wall-clock minute-of-day
  // range of 540–720 in Asia/Bangkok. Test schedules sit at
  // `scratchDate(d, hour)` which is UTC; with the default
  // `CLINIC_TIMEZONE=Asia/Bangkok` the local minute-of-day = `(hour + 7) *
  // 60` (mod 1440). Day-1 schedule starts at 09:00 UTC = 16:00 local
  // (= 960 min). The F13 fixture below uses a separate scratch day with
  // a more permissive layout so the existing tests stay green.
  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptHome.id,
      appointmentType: AppointmentType.CONSULTATION,
      durationMinutes: 20,
      createdBy: superAdmin.id,
    },
  });

  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptHome.id,
      appointmentType: AppointmentType.PROCEDURE,
      // F13 override — confirms per-pair `durationMinutes` drives `endAt`.
      durationMinutes: 90,
      createdBy: superAdmin.id,
    },
  });

  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptHome.id,
      appointmentType: AppointmentType.FOLLOW_UP,
      durationMinutes: 15,
      // F13 booking window — only allow FOLLOW_UP in the local 17:00–18:00
      // hour. With `CLINIC_TIMEZONE=Asia/Bangkok` (+7) that's 10:00–11:00
      // UTC. The day-1 schedule (09:00–12:00 UTC) overlaps part of that
      // local window; out-of-window scratch days exist below.
      bookingWindowStartMinute: 17 * 60,
      bookingWindowEndMinute: 18 * 60,
      createdBy: superAdmin.id,
    },
  });

  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptForeign.id,
      appointmentType: AppointmentType.CONSULTATION,
      durationMinutes: 20,
      createdBy: superAdmin.id,
    },
  });

  const nurseHome: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(NURSE_HOME_EMAIL),
        firstNameEn: 'AHome',
        lastNameEn: 'Nurse',
        roleId: nurseRole.id,
        departmentId: deptHome.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.NURSE,
  };

  const nurseForeign: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(NURSE_FOREIGN_EMAIL),
        firstNameEn: 'AForeign',
        lastNameEn: 'Nurse',
        roleId: nurseRole.id,
        departmentId: deptForeign.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.NURSE,
  };

  const doctorUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_USER_EMAIL),
        firstNameEn: 'ADoctor',
        lastNameEn: 'Home',
        roleId: doctorRole.id,
        departmentId: deptHome.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  const doctorOtherUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_OTHER_USER_EMAIL),
        firstNameEn: 'ADoctor',
        lastNameEn: 'Foreign',
        roleId: doctorRole.id,
        departmentId: deptForeign.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  const mro: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(MRO_EMAIL),
        firstNameEn: 'A',
        lastNameEn: 'MRO',
        roleId: mroRole.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.MEDICAL_RECORDS_OFFICER,
  };

  const stamp = Date.now().toString(36).slice(-6);

  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.user.id,
      doctorCode: `APPT-${stamp}-A`,
      identificationNo: `appt-${stamp}-a`,
      medicalLicenseNo: `MED-APPT-${stamp}-A`,
      phone: '+66-2-000-1001',
      createdBy: superAdmin.id,
    },
  });

  const doctorOther = await prisma.doctor.create({
    data: {
      userId: doctorOtherUser.user.id,
      doctorCode: `APPT-${stamp}-B`,
      identificationNo: `appt-${stamp}-b`,
      medicalLicenseNo: `MED-APPT-${stamp}-B`,
      phone: '+66-2-000-1002',
      createdBy: superAdmin.id,
    },
  });

  const patientStamp = Date.now().toString();
  const patient = await prisma.patient.create({
    data: {
      hn: deriveScratchHn(patientStamp),
      firstNameEn: 'Praewa',
      lastNameEn: 'Boonmee',
      identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${patientStamp}`,
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

  const patientForeign = await prisma.patient.create({
    data: {
      hn: deriveScratchHn(`${patientStamp}1`),
      firstNameEn: 'Somchai',
      lastNameEn: 'Sinthorn',
      identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${patientStamp}-fp`,
      phone: '+66-2-555-2001',
      dateOfBirth: new Date('1985-06-20T00:00:00.000Z'),
      gender: 'MALE',
      emergencyPersonName: 'Malee',
      emergencyPersonRelation: 'Mother',
      emergencyPersonPhone: '+66-2-555-2002',
      address: '456 Example Road',
      createdBy: superAdmin.id,
    },
  });

  // Schedule windows (all in the far future so the past-startAt guard
  // never fires accidentally):
  //   day 1: home doctor, no break, accepts booking — happy path.
  //   day 2: foreign doctor in foreign dept — DOCTOR scope test.
  //   day 3: home doctor, with break 10:00–11:00 — break overlap test.
  //   day 4: home doctor, acceptsBooking=false — bookable test.
  //   day 5: home doctor, 60-min window for PROCEDURE — type+dept test.
  const scheduleHome = await prisma.doctorSchedule.create({
    data: {
      doctorId: doctor.id,
      departmentId: deptHome.id,
      startAt: scratchDate(1, 9),
      endAt: scratchDate(1, 12),
      createdBy: superAdmin.id,
    },
  });

  const scheduleForeign = await prisma.doctorSchedule.create({
    data: {
      doctorId: doctorOther.id,
      departmentId: deptForeign.id,
      startAt: scratchDate(2, 9),
      endAt: scratchDate(2, 12),
      createdBy: superAdmin.id,
    },
  });

  const scheduleHomeBreak = await prisma.doctorSchedule.create({
    data: {
      doctorId: doctor.id,
      departmentId: deptHome.id,
      startAt: scratchDate(3, 9),
      endAt: scratchDate(3, 12),
      breakStartAt: scratchDate(3, 10),
      breakEndAt: scratchDate(3, 11),
      createdBy: superAdmin.id,
    },
  });

  const scheduleHomeNoBook = await prisma.doctorSchedule.create({
    data: {
      doctorId: doctor.id,
      departmentId: deptHome.id,
      startAt: scratchDate(4, 9),
      endAt: scratchDate(4, 12),
      acceptsBooking: false,
      createdBy: superAdmin.id,
    },
  });

  const scheduleHomeProcedure = await prisma.doctorSchedule.create({
    data: {
      doctorId: doctor.id,
      departmentId: deptHome.id,
      startAt: scratchDate(5, 9),
      endAt: scratchDate(5, 11),
      createdBy: superAdmin.id,
    },
  });

  // F13 — day-6 schedule wide enough to host the 90-min PROCEDURE
  // duration-drives-endAt assertion without colliding with day-5.
  const scheduleHomeF13 = await prisma.doctorSchedule.create({
    data: {
      doctorId: doctor.id,
      departmentId: deptHome.id,
      startAt: scratchDate(6, 9),
      endAt: scratchDate(6, 12),
      createdBy: superAdmin.id,
    },
  });

  return {
    nurseHome,
    nurseForeign,
    doctorUser,
    doctorOtherUser,
    mro,
    doctor,
    doctorOther,
    deptHome,
    deptForeign,
    patient,
    patientForeign,
    scheduleHome,
    scheduleForeign,
    scheduleHomeBreak,
    scheduleHomeNoBook,
    scheduleHomeProcedure,
    scheduleHomeF13,
    superAdminId: superAdmin.id,
  };
}

async function teardownFixturesByNames(prisma: PrismaService): Promise<void> {
  const emails = [
    normalizeEmail(NURSE_HOME_EMAIL),
    normalizeEmail(NURSE_FOREIGN_EMAIL),
    normalizeEmail(DOCTOR_USER_EMAIL),
    normalizeEmail(DOCTOR_OTHER_USER_EMAIL),
    normalizeEmail(MRO_EMAIL),
  ];

  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const doctors = await prisma.doctor.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const doctorIds = doctors.map((d) => d.id);

  const departments = await prisma.department.findMany({
    where: { name: { in: [DEPT_HOME_NAME, DEPT_FOREIGN_NAME] } },
    select: { id: true },
  });
  const departmentIds = departments.map((d) => d.id);

  const patients = await prisma.patient.findMany({
    where: { identificationNo: { startsWith: SCRATCH_PATIENT_ID_PREFIX } },
    select: { id: true },
  });
  const patientIds = patients.map((p) => p.id);

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

  await prisma.departmentAppointmentType.deleteMany({
    where: { departmentId: { in: departmentIds } },
  });

  await prisma.doctor.deleteMany({ where: { id: { in: doctorIds } } });

  await prisma.authLog.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { email: { in: emails } }],
    },
  });

  await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
}

describe('F09 — appointments e2e', () => {
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

  // ─── POST /appointments ────────────────────────────────────────────────────

  describe('POST /appointments', () => {
    maybe('Happy NURSE booking → 201', async () => {
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHome.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchIso(1, 9),
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body.status).toBe('BOOKED');
      expect(res.body.scheduleId).toBe(fixtures!.scheduleHome.id);
      expect(res.body.startAt).toBe(scratchIso(1, 9));
      expect(res.body.endAt).toBe(scratchIso(1, 9, 20));
    });

    maybe('Duplicate slot → 409 SLOT_TAKEN', async () => {
      // Happy path above booked 09:00–09:20 — second booking on the
      // SAME slot must trip the race guard.
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHome.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchIso(1, 9),
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe(ErrorCode.SLOT_TAKEN);
    });

    maybe('Happy DOCTOR self-booking (.own) → 201', async () => {
      // DOCTOR books for themselves in a different slot on day 1 so it
      // doesn't collide with the NURSE happy-path booking.
      const jwt = await jwtFor(fixtures!.doctorUser);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHome.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchIso(1, 11),
        });

      expect(res.status).toBe(201);
      expect(res.body.doctorId).toBe(fixtures!.doctor.id);
      expect(res.body.startAt).toBe(scratchIso(1, 11));
    });

    maybe('(department, type) mismatch → 400 DEPARTMENT_TYPE_NOT_ALLOWED', async () => {
      // The foreign dept allows ONLY CONSULTATION; ask for PROCEDURE.
      // Sign in as MRO so the scope check (foreign dept) doesn't trip
      // first — wait, MRO doesn't have appointment.create. Instead use
      // the foreign nurse so the scope passes and the type check is
      // what trips.
      const jwt = await jwtFor(fixtures!.nurseForeign);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctorOther.id,
          departmentId: fixtures!.deptForeign.id,
          scheduleId: fixtures!.scheduleForeign.id,
          appointmentType: AppointmentType.PROCEDURE,
          startAt: scratchIso(2, 9),
          reason: 'Test',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.DEPARTMENT_TYPE_NOT_ALLOWED);
    });

    maybe('Doctor home dept mismatch → 400 DOCTOR_DEPARTMENT_MISMATCH', async () => {
      // Foreign doctor lives in deptForeign; book against deptHome
      // (which DOES allow CONSULTATION). Sign in as MRO? No —
      // MRO lacks create. Use the home nurse: their dept matches the
      // requested dept so the scope check passes; the doctor's home
      // dept does NOT match, so the mismatch trips.
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctorOther.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleForeign.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchIso(2, 10),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.DOCTOR_DEPARTMENT_MISMATCH);
    });

    maybe('Past startAt → 400 APPOINTMENT_START_IN_PAST', async () => {
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHome.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: '2020-01-01T09:00:00.000Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.APPOINTMENT_START_IN_PAST);
    });

    maybe('PROCEDURE without reason → 400 VALIDATION_FAILED', async () => {
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHomeProcedure.id,
          appointmentType: AppointmentType.PROCEDURE,
          startAt: scratchIso(5, 9),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    maybe('PROCEDURE with reason → 201', async () => {
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHomeProcedure.id,
          appointmentType: AppointmentType.PROCEDURE,
          startAt: scratchIso(5, 9),
          reason: 'Routine pacemaker check-up',
        });

      expect(res.status).toBe(201);
      expect(res.body.reason).toBe('Routine pacemaker check-up');
      // F13 — `(deptHome, PROCEDURE)` carries a 90-min duration override
      // (vs the pre-F13 60-min default); endAt = startAt + 90 min.
      expect(res.body.endAt).toBe(scratchIso(5, 10, 30));
    });

    maybe('F13 — per-pair duration drives endAt (PROCEDURE = 90 min)', async () => {
      // `(deptHome, PROCEDURE)` carries a per-pair durationMinutes = 90.
      // The day-6 schedule (09:00–12:00 UTC) hosts this booking so it
      // does not collide with the day-5 PROCEDURE-with-reason fixture.
      // Booking at 09:00 UTC therefore returns endAt = 10:30 UTC — the
      // duration came from the per-pair row (90 min), not the retired
      // global const map (60 min for PROCEDURE).
      //
      // Start time pinned to 09:00 UTC because the sliding-window grid
      // re-anchored on the day-6 schedule's start (no other bookings on
      // day-6) emits 09:00 + 90, then 10:30 + 90 (which would spill past
      // 12:00 and is dropped). 09:30 would be off-grid — see
      // SLOT_NOT_ON_GRID in appointments.service.ts.
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patientForeign.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHomeF13.id,
          appointmentType: AppointmentType.PROCEDURE,
          startAt: scratchIso(6, 9),
          reason: 'F13 90-min duration check',
        });

      expect(res.status).toBe(201);
      expect(res.body.startAt).toBe(scratchIso(6, 9));
      // 09:00 + 90 min = 10:30.
      expect(res.body.endAt).toBe(scratchIso(6, 10, 30));
    });

    maybe('F13 — in-window booking succeeds for FOLLOW_UP (10:35 UTC = 17:35 local)', async () => {
      // FOLLOW_UP carries a 17:00–18:00 LOCAL booking window. Day-1
      // schedule (09:00–12:00 UTC). 10:35 UTC = 17:35 Asia/Bangkok →
      // localMin = 1055 ∈ [1020, 1080) → in-window.
      //
      // Start time pinned to 10:35 (not 10:30) so it lands on the
      // sliding-window grid: day-1 has prior bookings at 09:00–09:20
      // (NURSE CONSULTATION) and 11:00–11:20 (DOCTOR CONSULTATION),
      // leaving free intervals [09:20, 11:00) and [11:20, 12:00). A
      // FOLLOW_UP step (15 min) anchored at 09:20 emits 09:20, 09:35,
      // …, 10:35, 10:50 — 10:30 would be off-grid (it sits between
      // 10:20 and 10:35). See SLOT_NOT_ON_GRID in
      // appointments.service.ts.
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHome.id,
          appointmentType: AppointmentType.FOLLOW_UP,
          startAt: scratchIso(1, 10, 35),
        });

      expect(res.status).toBe(201);
      expect(res.body.startAt).toBe(scratchIso(1, 10, 35));
      // FOLLOW_UP duration = 15 min → endAt = 10:50 UTC.
      expect(res.body.endAt).toBe(scratchIso(1, 10, 50));
    });

    maybe('F13 — out-of-window booking → 400 APPOINTMENT_OUTSIDE_BOOKING_WINDOW', async () => {
      // FOLLOW_UP window is 17:00–18:00 LOCAL. 09:00 UTC = 16:00
      // Asia/Bangkok → localMin = 960 < 1020 → out-of-window.
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHome.id,
          appointmentType: AppointmentType.FOLLOW_UP,
          startAt: scratchIso(1, 9),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.APPOINTMENT_OUTSIDE_BOOKING_WINDOW);
    });

    maybe('Slot outside schedule → 400 SLOT_OUTSIDE_SCHEDULE', async () => {
      // Schedule day 1 runs 09:00–12:00; ask for 13:00.
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHome.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchIso(1, 13),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.SLOT_OUTSIDE_SCHEDULE);
    });

    maybe('Slot overlaps break → 400 SLOT_OVERLAPS_BREAK', async () => {
      // scheduleHomeBreak (day 3) has break 10:00–11:00; ask for
      // 10:00–10:20 which falls inside.
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHomeBreak.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchIso(3, 10),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.SLOT_OVERLAPS_BREAK);
    });

    maybe('Schedule not bookable → 400 SCHEDULE_NOT_BOOKABLE', async () => {
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHomeNoBook.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchIso(4, 9),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.SCHEDULE_NOT_BOOKABLE);
    });

    maybe('NURSE booking in foreign dept → 403 INSUFFICIENT_PERMISSION_SCOPE', async () => {
      // Home nurse tries to book at the foreign doctor's schedule.
      const jwt = await jwtFor(fixtures!.nurseHome);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctorOther.id,
          departmentId: fixtures!.deptForeign.id,
          scheduleId: fixtures!.scheduleForeign.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchIso(2, 11),
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION_SCOPE);
    });

    maybe('DOCTOR booking for foreign doctor → 403 INSUFFICIENT_PERMISSION_SCOPE', async () => {
      const jwt = await jwtFor(fixtures!.doctorUser);

      const res = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctorOther.id,
          departmentId: fixtures!.deptForeign.id,
          scheduleId: fixtures!.scheduleForeign.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchIso(2, 11, 20),
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION_SCOPE);
    });
  });

  // ─── GET /appointments ─────────────────────────────────────────────────────

  describe('GET /appointments', () => {
    maybe('NURSE narrowed to own dept (foreign-dept rows hidden)', async () => {
      // Seed one foreign-dept booking so we can assert it doesn't leak.
      await prisma.appointment.create({
        data: {
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctorOther.id,
          departmentId: fixtures!.deptForeign.id,
          scheduleId: fixtures!.scheduleForeign.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchDate(2, 11, 40),
          endAt: scratchDate(2, 12),
          createdBy: fixtures!.superAdminId,
        },
      });

      const jwt = await jwtFor(fixtures!.nurseHome);
      const res = await request(server)
        .get('/api/v1/appointments?pageSize=100')
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);

      for (const row of res.body.data) {
        expect(row.departmentId).toBe(fixtures!.deptHome.id);
      }
    });

    maybe('DOCTOR narrowed to own doctor', async () => {
      const jwt = await jwtFor(fixtures!.doctorUser);
      const res = await request(server)
        .get('/api/v1/appointments?pageSize=100')
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);

      for (const row of res.body.data) {
        expect(row.doctorId).toBe(fixtures!.doctor.id);
      }
    });

    maybe('MRO sees all departments', async () => {
      const jwt = await jwtFor(fixtures!.mro);
      const res = await request(server)
        .get('/api/v1/appointments?pageSize=100')
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);

      const depts = new Set(
        res.body.data.map((r: { departmentId: string }) => r.departmentId),
      );
      // We populated bookings in both home AND foreign depts above.
      expect(depts.has(fixtures!.deptHome.id)).toBe(true);
      expect(depts.has(fixtures!.deptForeign.id)).toBe(true);
    });

    maybe('NURSE explicit ?departmentId=<foreign> → 403 INSUFFICIENT_PERMISSION_SCOPE', async () => {
      const jwt = await jwtFor(fixtures!.nurseHome);
      const res = await request(server)
        .get(`/api/v1/appointments?departmentId=${fixtures!.deptForeign.id}`)
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION_SCOPE);
    });
  });

  // ─── GET /appointments/:id ─────────────────────────────────────────────────

  describe('GET /appointments/:id', () => {
    maybe('out-of-scope row → 404 APPOINTMENT_NOT_FOUND (no existence leak)', async () => {
      // Home nurse tries to fetch the foreign-dept booking the list
      // test created above.
      const foreignRow = await prisma.appointment.findFirst({
        where: { departmentId: fixtures!.deptForeign.id },
        select: { id: true },
      });

      if (!foreignRow) {
        throw new Error('foreign appointment fixture missing');
      }

      const jwt = await jwtFor(fixtures!.nurseHome);
      const res = await request(server)
        .get(`/api/v1/appointments/${foreignRow.id}`)
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(ErrorCode.APPOINTMENT_NOT_FOUND);
    });
  });

  // ─── POST /appointments/:id/cancel ─────────────────────────────────────────

  describe('POST /appointments/:id/cancel', () => {
    let cancellableId: string;

    maybe('Happy cancel → slot is freed (re-book same slot returns 201)', async () => {
      // Seed a brand-new BOOKED appointment so the test is independent
      // of the order other suites ran in.
      const booked = await prisma.appointment.create({
        data: {
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHome.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchDate(1, 11, 20),
          endAt: scratchDate(1, 11, 40),
          createdBy: fixtures!.superAdminId,
        },
      });

      cancellableId = booked.id;

      const jwt = await jwtFor(fixtures!.nurseHome);
      const cancelRes = await request(server)
        .post(`/api/v1/appointments/${booked.id}/cancel`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ cancellationReason: 'Patient no-show' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('CANCELLED');
      expect(cancelRes.body.cancellationReason).toBe('Patient no-show');
      expect(cancelRes.body.cancelledAt).toEqual(expect.any(String));

      // Now re-book the same slot — must succeed since CANCELLED rows
      // do NOT block.
      const rebookRes = await request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          patientId: fixtures!.patient.id,
          doctorId: fixtures!.doctor.id,
          departmentId: fixtures!.deptHome.id,
          scheduleId: fixtures!.scheduleHome.id,
          appointmentType: AppointmentType.CONSULTATION,
          startAt: scratchIso(1, 11, 20),
        });

      expect(rebookRes.status).toBe(201);
    });

    maybe('Already-cancelled → 409 APPOINTMENT_ALREADY_CANCELLED', async () => {
      const jwt = await jwtFor(fixtures!.nurseHome);
      const res = await request(server)
        .post(`/api/v1/appointments/${cancellableId}/cancel`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.code).toBe(ErrorCode.APPOINTMENT_ALREADY_CANCELLED);
    });

    maybe('Scope violation (NURSE on foreign dept) → 403', async () => {
      const foreignRow = await prisma.appointment.findFirst({
        where: { departmentId: fixtures!.deptForeign.id, status: 'BOOKED' },
        select: { id: true },
      });

      if (!foreignRow) {
        throw new Error('foreign BOOKED appointment fixture missing');
      }

      const jwt = await jwtFor(fixtures!.nurseHome);
      const res = await request(server)
        .post(`/api/v1/appointments/${foreignRow.id}/cancel`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION_SCOPE);
    });
  });
});
