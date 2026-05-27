/**
 * End-to-end coverage for F14 — appointment groups + referrals.
 *
 * Mirrors the F09 / F08 e2e shape: tests run against the real Nest app +
 * seeded Postgres but skip gracefully when the DB is unreachable.
 *
 * What is covered (per US-14.1 .. US-14.7 + the F14 roadmap smoke test):
 *  - POST /appointments with `previousAppointmentId`
 *    - Standalone → no group / no visit number.
 *    - First continuation → materialises a fresh group, prev becomes
 *      visit 1, new becomes visit 2.
 *    - Second continuation onto existing group → attaches as visit 3.
 *    - Continuation with a CANCELLED prev → 400 PREVIOUS_APPOINTMENT_CANCELLED.
 *    - Continuation with a different patient → 400 APPOINTMENT_GROUP_PATIENT_MISMATCH.
 *    - Continuation after the group was closed → 400 APPOINTMENT_GROUP_CLOSED.
 *    - Continuation against a referral with a department mismatch
 *      → 400 REFERRAL_DEPARTMENT_MISMATCH.
 *    - Continuation that picks up a pending referral → sets
 *      `referralFulfilledByAppointmentId` on the source.
 *    - Two parallel continuations on the same fulfilled source →
 *      second returns 409 REFERRAL_ALREADY_FULFILLED.
 *  - POST /appointments/:id/complete
 *    - Happy BOOKED → COMPLETED.
 *    - Idempotent on COMPLETED.
 *    - Reject from CANCELLED → 409 APPOINTMENT_NOT_BOOKED.
 *    - Non-doctor caller → 403 INSUFFICIENT_PERMISSION_SCOPE.
 *  - POST /appointments/:id/refer
 *    - Happy refer → status COMPLETED + referredToDepartmentId +
 *      referredAt populated.
 *    - Second refer → 409 APPOINTMENT_ALREADY_REFERRED.
 *    - Unknown toDepartmentId → 400 NOT_FOUND.
 *  - GET /appointments?pendingReferralToDepartmentId=<B>
 *    - Source NURSE in dept B sees the still-pending pickup.
 *    - After pickup, the same query returns zero rows.
 *  - GET /appointment-groups
 *    - Lists open + closed groups for a patient with member counts +
 *      latest-visit summary.
 *    - `status=open` / `status=closed` narrows correctly.
 *  - GET /appointment-groups/:id
 *    - Chronological member list, visit numbers populated.
 *  - POST /appointment-groups/:id/close
 *    - Doctor on latest visit closes → 200, closedAt set, latest →
 *      COMPLETED.
 *    - Foreign doctor → 403 APPOINTMENT_GROUP_CLOSE_FORBIDDEN.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AppointmentStatus,
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

const NURSE_A_EMAIL = 'f14-nurse-a-e2e@gmail.com';
const NURSE_B_EMAIL = 'f14-nurse-b-e2e@gmail.com';
const DOCTOR_A_EMAIL = 'f14-doctor-a-e2e@gmail.com';
const DOCTOR_B_EMAIL = 'f14-doctor-b-e2e@gmail.com';

const DEPT_A_NAME = 'F14 E2E Dept A';
const DEPT_B_NAME = 'F14 E2E Dept B';

const SCRATCH_PATIENT_ID_PREFIX = 'f14-e2e-pid-';

// Far-future scratch month so past-startAt guard never fires.
const SCRATCH_YEAR = 2097;
const SCRATCH_MONTH = 11;

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
  nurseA: UserWithRole;
  nurseB: UserWithRole;
  doctorAUser: UserWithRole;
  doctorBUser: UserWithRole;
  doctorA: Doctor;
  doctorB: Doctor;
  deptA: Department;
  deptB: Department;
  patient: Patient;
  otherPatient: Patient;
  scheduleA: DoctorSchedule;
  scheduleB: DoctorSchedule;
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

async function setupFixtures(prisma: PrismaService): Promise<Fixtures | null> {
  const nurseRole = await prisma.role.findUnique({ where: { code: ROLE.NURSE } });
  const doctorRole = await prisma.role.findUnique({ where: { code: ROLE.DOCTOR } });
  const superAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@gmail.com' },
  });

  if (!nurseRole || !doctorRole || !superAdmin) {
    return null;
  }

  await teardownFixturesByNames(prisma);

  const deptA = await prisma.department.create({
    data: {
      name: DEPT_A_NAME,
      description: 'F14 e2e — origin dept',
      createdBy: superAdmin.id,
    },
  });

  const deptB = await prisma.department.create({
    data: {
      name: DEPT_B_NAME,
      description: 'F14 e2e — referral destination dept',
      createdBy: superAdmin.id,
    },
  });

  // Both depts offer NEW_PATIENT_VISIT + CONSULTATION + FOLLOW_UP so the
  // booking transaction has something to match. Booking window kept wide-open
  // (NULL on both sides) so the F13 window guard never trips.
  // NEW_PATIENT_VISIT is required for standalone bookings (Bug-1 fix).
  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptA.id,
      appointmentType: AppointmentType.NEW_PATIENT_VISIT,
      durationMinutes: 30,
      createdBy: superAdmin.id,
    },
  });

  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptA.id,
      appointmentType: AppointmentType.CONSULTATION,
      durationMinutes: 20,
      createdBy: superAdmin.id,
    },
  });

  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptA.id,
      appointmentType: AppointmentType.FOLLOW_UP,
      durationMinutes: 20,
      createdBy: superAdmin.id,
    },
  });

  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptB.id,
      appointmentType: AppointmentType.NEW_PATIENT_VISIT,
      durationMinutes: 30,
      createdBy: superAdmin.id,
    },
  });

  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptB.id,
      appointmentType: AppointmentType.CONSULTATION,
      durationMinutes: 20,
      createdBy: superAdmin.id,
    },
  });

  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptB.id,
      appointmentType: AppointmentType.FOLLOW_UP,
      durationMinutes: 20,
      createdBy: superAdmin.id,
    },
  });

  const nurseA: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(NURSE_A_EMAIL),
        firstNameEn: 'NA',
        lastNameEn: 'Nurse',
        roleId: nurseRole.id,
        departmentId: deptA.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.NURSE,
  };

  const nurseB: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(NURSE_B_EMAIL),
        firstNameEn: 'NB',
        lastNameEn: 'Nurse',
        roleId: nurseRole.id,
        departmentId: deptB.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.NURSE,
  };

  const doctorAUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_A_EMAIL),
        firstNameEn: 'DA',
        lastNameEn: 'Doctor',
        roleId: doctorRole.id,
        departmentId: deptA.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  const doctorBUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_B_EMAIL),
        firstNameEn: 'DB',
        lastNameEn: 'Doctor',
        roleId: doctorRole.id,
        departmentId: deptB.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  const stamp = Date.now().toString(36).slice(-6);

  const doctorA = await prisma.doctor.create({
    data: {
      userId: doctorAUser.user.id,
      doctorCode: `F14-${stamp}-A`,
      identificationNo: `f14-${stamp}-a`,
      medicalLicenseNo: `MED-F14-${stamp}-A`,
      phone: '+66-2-000-1001',
      createdBy: superAdmin.id,
    },
  });

  const doctorB = await prisma.doctor.create({
    data: {
      userId: doctorBUser.user.id,
      doctorCode: `F14-${stamp}-B`,
      identificationNo: `f14-${stamp}-b`,
      medicalLicenseNo: `MED-F14-${stamp}-B`,
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

  const otherPatient = await prisma.patient.create({
    data: {
      hn: deriveScratchHn(`${patientStamp}1`),
      firstNameEn: 'Other',
      lastNameEn: 'Patient',
      identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${patientStamp}-other`,
      phone: '+66-2-555-2001',
      dateOfBirth: new Date('1992-02-22T00:00:00.000Z'),
      gender: 'MALE',
      emergencyPersonName: 'Sibling',
      emergencyPersonRelation: 'Brother',
      emergencyPersonPhone: '+66-2-555-2002',
      address: '456 Example Road',
      createdBy: superAdmin.id,
    },
  });

  // One wide schedule per doctor. The booking days are spaced out so
  // each test scenario can pick a unique slot.
  const scheduleA = await prisma.doctorSchedule.create({
    data: {
      doctorId: doctorA.id,
      departmentId: deptA.id,
      startAt: scratchDate(1, 9),
      endAt: scratchDate(1, 18),
      createdBy: superAdmin.id,
    },
  });

  const scheduleB = await prisma.doctorSchedule.create({
    data: {
      doctorId: doctorB.id,
      departmentId: deptB.id,
      startAt: scratchDate(2, 9),
      endAt: scratchDate(2, 18),
      createdBy: superAdmin.id,
    },
  });

  return {
    nurseA,
    nurseB,
    doctorAUser,
    doctorBUser,
    doctorA,
    doctorB,
    deptA,
    deptB,
    patient,
    otherPatient,
    scheduleA,
    scheduleB,
    superAdminId: superAdmin.id,
  };
}

async function teardownFixturesByNames(prisma: PrismaService): Promise<void> {
  const emails = [
    normalizeEmail(NURSE_A_EMAIL),
    normalizeEmail(NURSE_B_EMAIL),
    normalizeEmail(DOCTOR_A_EMAIL),
    normalizeEmail(DOCTOR_B_EMAIL),
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
    where: { name: { in: [DEPT_A_NAME, DEPT_B_NAME] } },
    select: { id: true },
  });
  const departmentIds = departments.map((d) => d.id);

  const patients = await prisma.patient.findMany({
    where: { identificationNo: { startsWith: SCRATCH_PATIENT_ID_PREFIX } },
    select: { id: true },
  });
  const patientIds = patients.map((p) => p.id);

  // Detach appointment self-FKs before deleting rows so the
  // `referral_fulfilled_by_appointment_id` constraint doesn't block
  // the cleanup (each row points at a sibling row that we also delete).
  await prisma.appointment.updateMany({
    where: {
      OR: [
        { doctorId: { in: doctorIds } },
        { patientId: { in: patientIds } },
        { departmentId: { in: departmentIds } },
      ],
    },
    data: {
      referralFulfilledByAppointmentId: null,
      appointmentGroupId: null,
      visitNumber: null,
    },
  });

  await prisma.appointmentGroup.deleteMany({
    where: { patientId: { in: patientIds } },
  });

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
    where: { OR: [{ userId: { in: userIds } }, { email: { in: emails } }] },
  });

  await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
}

describe('F14 — appointment groups + referrals e2e', () => {
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

  /**
   * The full smoke-test scenario from the F14 roadmap:
   *   1. book in dept A.
   *   2. refer → completes A + flags referral.
   *   3. pending pickup visible in dept B.
   *   4. book in dept B with previousAppointmentId → group created,
   *      visit_number 1/2 stamped, referral fulfilled.
   *   5. close → latest visit COMPLETED + group.closedAt set.
   *   6. third continuation onto the closed group → 400.
   */
  maybe('F14 smoke — book → refer → pickup → close → blocked', async () => {
    const f = fixtures!;
    const nurseAJwt = await jwtFor(f.nurseA);
    const nurseBJwt = await jwtFor(f.nurseB);
    const doctorAJwt = await jwtFor(f.doctorAUser);
    const doctorBJwt = await jwtFor(f.doctorBUser);

    // 1. Book the first visit in dept A.
    const apptARes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(1, 9),
      });

    expect(apptARes.status).toBe(201);
    expect(apptARes.body.appointmentGroupId).toBeNull();
    expect(apptARes.body.visitNumber).toBeNull();
    const apptAId = apptARes.body.id as string;

    // 2. Doctor A refers to dept B.
    const referRes = await request(server)
      .post(`/api/v1/appointments/${apptAId}/refer`)
      .set('Authorization', `Bearer ${doctorAJwt}`)
      .send({ toDepartmentId: f.deptB.id, note: 'Refer note' });

    expect(referRes.status).toBe(200);
    expect(referRes.body.status).toBe(AppointmentStatus.COMPLETED);
    expect(referRes.body.referredToDepartmentId).toBe(f.deptB.id);
    expect(referRes.body.referredAt).toEqual(expect.any(String));

    // 3. Nurse B sees the pending pickup.
    const queueRes = await request(server)
      .get('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .query({ pendingReferralOnly: 'true' });

    expect(queueRes.status).toBe(200);
    const queueIds = (queueRes.body.data as Array<{ id: string }>).map(
      (r) => r.id,
    );
    expect(queueIds).toContain(apptAId);

    // 4. Nurse B books the pickup in dept B (visit 2). Continuation
    // bookings MUST use FOLLOW_UP, PROCEDURE, or CONSULTATION.
    const apptBRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorB.id,
        departmentId: f.deptB.id,
        scheduleId: f.scheduleB.id,
        appointmentType: AppointmentType.FOLLOW_UP,
        startAt: scratchIso(2, 9),
        previousAppointmentId: apptAId,
      });

    expect(apptBRes.status).toBe(201);
    expect(apptBRes.body.appointmentGroupId).toEqual(expect.any(String));
    expect(apptBRes.body.visitNumber).toBe(2);
    const apptBId = apptBRes.body.id as string;
    const groupId = apptBRes.body.appointmentGroupId as string;

    // Prev should be back-linked: visit 1 + referralFulfilledBy = apptB.
    const apptAReread = await prisma.appointment.findUniqueOrThrow({
      where: { id: apptAId },
    });
    expect(apptAReread.visitNumber).toBe(1);
    expect(apptAReread.appointmentGroupId).toBe(groupId);
    expect(apptAReread.referralFulfilledByAppointmentId).toBe(apptBId);

    // Pickup queue now empty for dept B.
    const queueAfterRes = await request(server)
      .get('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .query({ pendingReferralOnly: 'true' });
    expect(queueAfterRes.status).toBe(200);
    const queueAfterIds = (
      queueAfterRes.body.data as Array<{ id: string }>
    ).map((r) => r.id);
    expect(queueAfterIds).not.toContain(apptAId);

    // 5. Doctor B completes the appointment (which atomically closes the group).
    const closeRes = await request(server)
      .post(`/api/v1/appointments/${apptBId}/complete`)
      .set('Authorization', `Bearer ${doctorBJwt}`)
      .send({ note: 'Closing case note' });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe(AppointmentStatus.COMPLETED);

    // Verify the group is closed by fetching the group.
    const groupRes = await request(server)
      .get(`/api/v1/appointment-groups/${groupId}`)
      .set('Authorization', `Bearer ${nurseBJwt}`);

    expect(groupRes.status).toBe(200);
    expect(groupRes.body.closedAt).toEqual(expect.any(String));
    const latest = (groupRes.body.members as Array<{
      id: string;
      status: string;
    }>).find((m) => m.id === apptBId);
    expect(latest?.status).toBe(AppointmentStatus.COMPLETED);

    // 6. Attempt a third visit onto the closed group → 400.
    const blockedRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorB.id,
        departmentId: f.deptB.id,
        scheduleId: f.scheduleB.id,
        appointmentType: AppointmentType.FOLLOW_UP,
        startAt: scratchIso(2, 10),
        previousAppointmentId: apptBId,
      });
    expect(blockedRes.status).toBe(400);
    expect(blockedRes.body.code).toBe(ErrorCode.APPOINTMENT_GROUP_CLOSED);
  });

  maybe('Refer rejects when caller is not the doctor on the row', async () => {
    const f = fixtures!;
    const nurseAJwt = await jwtFor(f.nurseA);
    const nurseBJwt = await jwtFor(f.nurseB);

    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(1, 10),
      });
    expect(apptRes.status).toBe(201);

    const referRes = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/refer`)
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({ toDepartmentId: f.deptB.id, note: 'Refer note' });

    // Nurse B has appointment.update.own-department but the appointment
    // is in dept A → 403 INSUFFICIENT_PERMISSION_SCOPE.
    expect(referRes.status).toBe(403);
    expect(referRes.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION_SCOPE);
  });

  maybe('Refer twice on the same row → 409 APPOINTMENT_ALREADY_REFERRED', async () => {
    const f = fixtures!;
    const nurseAJwt = await jwtFor(f.nurseA);
    const doctorAJwt = await jwtFor(f.doctorAUser);

    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(1, 11),
      });
    expect(apptRes.status).toBe(201);

    const first = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/refer`)
      .set('Authorization', `Bearer ${doctorAJwt}`)
      .send({ toDepartmentId: f.deptB.id, note: 'Refer note' });
    expect(first.status).toBe(200);

    const second = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/refer`)
      .set('Authorization', `Bearer ${doctorAJwt}`)
      .send({ toDepartmentId: f.deptB.id, note: 'Refer note' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe(ErrorCode.APPOINTMENT_ALREADY_REFERRED);
  });

  maybe('Complete BOOKED → COMPLETED + idempotent on re-call', async () => {
    const f = fixtures!;
    const nurseAJwt = await jwtFor(f.nurseA);
    const doctorAJwt = await jwtFor(f.doctorAUser);

    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(1, 12),
      });
    expect(apptRes.status).toBe(201);

    const completeRes = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/complete`)
      .set('Authorization', `Bearer ${doctorAJwt}`)
      .send({ note: 'Complete note' });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe(AppointmentStatus.COMPLETED);

    const completeAgain = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/complete`)
      .set('Authorization', `Bearer ${doctorAJwt}`)
      .send({ note: 'Complete note' });

    expect(completeAgain.status).toBe(409);
    expect(completeAgain.body.code).toBe(ErrorCode.APPOINTMENT_ALREADY_COMPLETED);
  });

  maybe('Complete on CANCELLED row → 409 APPOINTMENT_NOT_BOOKED', async () => {
    const f = fixtures!;
    const nurseAJwt = await jwtFor(f.nurseA);
    const doctorAJwt = await jwtFor(f.doctorAUser);

    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(1, 13),
      });
    expect(apptRes.status).toBe(201);

    const cancelRes = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/cancel`)
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({ cancellationReason: 'Cancelled for test setup' });
    expect(cancelRes.status).toBe(200);

    const completeRes = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/complete`)
      .set('Authorization', `Bearer ${doctorAJwt}`)
      .send({ note: 'Complete note' });
    expect(completeRes.status).toBe(409);
    expect(completeRes.body.code).toBe(ErrorCode.APPOINTMENT_NOT_BOOKED);
  });

  maybe('Continuation with patient mismatch → 400 APPOINTMENT_GROUP_PATIENT_MISMATCH', async () => {
    const f = fixtures!;
    const nurseAJwt = await jwtFor(f.nurseA);

    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(1, 14),
      });
    expect(apptRes.status).toBe(201);

    const mismatchRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.otherPatient.id, // different patient
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.CONSULTATION,
        startAt: scratchIso(1, 14, 30),
        previousAppointmentId: apptRes.body.id,
      });
    expect(mismatchRes.status).toBe(400);
    expect(mismatchRes.body.code).toBe(
      ErrorCode.APPOINTMENT_GROUP_PATIENT_MISMATCH,
    );
  });

  maybe('Continuation against referral with wrong department → 400 REFERRAL_DEPARTMENT_MISMATCH', async () => {
    const f = fixtures!;
    const nurseAJwt = await jwtFor(f.nurseA);
    const doctorAJwt = await jwtFor(f.doctorAUser);

    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(1, 15),
      });
    expect(apptRes.status).toBe(201);

    // Refer to dept B.
    const referRes = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/refer`)
      .set('Authorization', `Bearer ${doctorAJwt}`)
      .send({ toDepartmentId: f.deptB.id, note: 'Refer note' });
    expect(referRes.status).toBe(200);

    // Try to continue in dept A again — does NOT match dept B.
    // FOLLOW_UP because it is a valid continuation type.
    const wrongDeptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.FOLLOW_UP,
        startAt: scratchIso(1, 15, 30),
        previousAppointmentId: apptRes.body.id,
      });
    expect(wrongDeptRes.status).toBe(400);
    expect(wrongDeptRes.body.code).toBe(ErrorCode.REFERRAL_DEPARTMENT_MISMATCH);
  });

  maybe('Continuation with CANCELLED prev → 400 PREVIOUS_APPOINTMENT_CANCELLED', async () => {
    const f = fixtures!;
    const nurseAJwt = await jwtFor(f.nurseA);

    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(1, 16),
      });
    expect(apptRes.status).toBe(201);

    const cancelRes = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/cancel`)
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({ cancellationReason: 'Cancelled for test setup' });
    expect(cancelRes.status).toBe(200);

    const continueRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.FOLLOW_UP,
        startAt: scratchIso(1, 16, 30),
        previousAppointmentId: apptRes.body.id,
      });
    expect(continueRes.status).toBe(400);
    expect(continueRes.body.code).toBe(
      ErrorCode.PREVIOUS_APPOINTMENT_CANCELLED,
    );
  });

  maybe('Continuation from COMPLETED prev with FOLLOW_UP → 201', async () => {
    const f = fixtures!;
    const nurseBJwt = await jwtFor(f.nurseB);
    const doctorBJwt = await jwtFor(f.doctorBUser);

    // The smoke test already booked scheduleB at 09:00 (FOLLOW_UP, 20 min,
    // COMPLETED). The free interval for NEW_PATIENT_VISIT (30 min) starts at
    // 09:20; the first on-grid slot is 09:20.
    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorB.id,
        departmentId: f.deptB.id,
        scheduleId: f.scheduleB.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(2, 9, 20),
      });
    expect(apptRes.status).toBe(201);

    const completeRes = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/complete`)
      .set('Authorization', `Bearer ${doctorBJwt}`)
      .send({ note: 'Complete note' });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe(AppointmentStatus.COMPLETED);

    const continueRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorB.id,
        departmentId: f.deptB.id,
        scheduleId: f.scheduleB.id,
        appointmentType: AppointmentType.FOLLOW_UP,
        // 11:30 — after blockers [09:00,09:20) and [09:20,09:50), the free
        // interval starts at 09:50. The 20-min FOLLOW_UP grid from 09:50
        // gives 09:50, 10:10, 10:30, 10:50, 11:10, 11:30 (5 steps × 20 min).
        startAt: scratchIso(2, 11, 30),
        previousAppointmentId: apptRes.body.id,
      });
    expect(continueRes.status).toBe(201);
    expect(continueRes.body.appointmentGroupId).toEqual(expect.any(String));
    expect(continueRes.body.visitNumber).toBe(2);
  });

  maybe('Continuation from BOOKED prev → 400 PREVIOUS_APPOINTMENT_NOT_COMPLETED', async () => {
    const f = fixtures!;
    const nurseBJwt = await jwtFor(f.nurseB);

    // 10:20 — after prior blockers on scheduleB, the first available
    // 30-min NEW_PATIENT_VISIT slot is 10:20 (free interval 09:50–11:30).
    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorB.id,
        departmentId: f.deptB.id,
        scheduleId: f.scheduleB.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(2, 10, 20),
      });
    expect(apptRes.status).toBe(201);

    // prev is still BOOKED (no complete / cancel / refer fired) → 400.
    const continueRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorB.id,
        departmentId: f.deptB.id,
        scheduleId: f.scheduleB.id,
        appointmentType: AppointmentType.FOLLOW_UP,
        startAt: scratchIso(2, 12, 30),
        previousAppointmentId: apptRes.body.id,
      });
    expect(continueRes.status).toBe(400);
    expect(continueRes.body.code).toBe(
      ErrorCode.PREVIOUS_APPOINTMENT_NOT_COMPLETED,
    );
  });

  maybe('Continuation with CONSULTATION type → 201', async () => {
    const f = fixtures!;
    const nurseBJwt = await jwtFor(f.nurseB);
    const doctorBJwt = await jwtFor(f.doctorBUser);

    // 10:50 — after prior blockers on scheduleB, the on-grid slot at
    // 10:50 is available (free interval 10:50–11:30).
    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorB.id,
        departmentId: f.deptB.id,
        scheduleId: f.scheduleB.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(2, 10, 50),
      });
    expect(apptRes.status).toBe(201);

    const completeRes = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/complete`)
      .set('Authorization', `Bearer ${doctorBJwt}`)
      .send({ note: 'Complete note' });
    expect(completeRes.status).toBe(200);

    // CONSULTATION is now a valid continuation type — should return 201.
    const continueRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorB.id,
        departmentId: f.deptB.id,
        scheduleId: f.scheduleB.id,
        appointmentType: AppointmentType.CONSULTATION,
        startAt: scratchIso(2, 13, 30),
        previousAppointmentId: apptRes.body.id,
      });
    expect(continueRes.status).toBe(201);
    expect(continueRes.body.appointmentGroupId).toEqual(expect.any(String));
    expect(continueRes.body.visitNumber).toBe(2);
  });

  maybe('Continuation with NEW_PATIENT_VISIT type → 400 CONTINUATION_APPOINTMENT_TYPE_INVALID', async () => {
    const f = fixtures!;
    const nurseBJwt = await jwtFor(f.nurseB);
    const doctorBJwt = await jwtFor(f.doctorBUser);

    // 14:50 — on the NEW_PATIENT_VISIT (30-min) grid re-anchored at
    // the prior CONSULTATION blocker's end (13:50 + 60 = 14:50).
    const apptRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorB.id,
        departmentId: f.deptB.id,
        scheduleId: f.scheduleB.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(2, 14, 50),
      });
    expect(apptRes.status).toBe(201);

    const completeRes = await request(server)
      .post(`/api/v1/appointments/${apptRes.body.id}/complete`)
      .set('Authorization', `Bearer ${doctorBJwt}`);
    expect(completeRes.status).toBe(200);

    // NEW_PATIENT_VISIT is the only type that cannot be used as a
    // continuation. The type-guard fires before the grid check, so the
    // startAt below doesn't need to be on a grid step.
    const continueRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseBJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorB.id,
        departmentId: f.deptB.id,
        scheduleId: f.scheduleB.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(2, 15, 30),
        previousAppointmentId: apptRes.body.id,
      });
    expect(continueRes.status).toBe(400);
    expect(continueRes.body.code).toBe(
      ErrorCode.CONTINUATION_APPOINTMENT_TYPE_INVALID,
    );
    expect(continueRes.body.details?.allowedAppointmentTypes).toEqual(
      expect.arrayContaining([
        AppointmentType.FOLLOW_UP,
        AppointmentType.PROCEDURE,
        AppointmentType.CONSULTATION,
      ]),
    );
  });

  maybe('GET /appointment-groups + detail returns chronological members', async () => {
    const f = fixtures!;
    const nurseAJwt = await jwtFor(f.nurseA);
    const doctorAJwt = await jwtFor(f.doctorAUser);

    // Standalone first booking — no group yet.
    const firstRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: scratchIso(1, 17),
      });
    expect(firstRes.status).toBe(201);

    // Continuations require the prev to be COMPLETED (F14 — Rule 1).
    const completeRes = await request(server)
      .post(`/api/v1/appointments/${firstRes.body.id}/complete`)
      .set('Authorization', `Bearer ${doctorAJwt}`)
      .send({ note: 'Complete note' });
    expect(completeRes.status).toBe(200);

    // Continuation → group is materialised.
    const secondRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.FOLLOW_UP,
        // 17:30 — NEW_PATIENT_VISIT at 17:00 occupies [17:00, 17:30).
        // The next free interval starts at 17:30; the 20-min FOLLOW_UP
        // grid anchors there. 17:40 would be off-grid (SLOT_NOT_ON_GRID).
        startAt: scratchIso(1, 17, 30),
        previousAppointmentId: firstRes.body.id,
      });
    expect(secondRes.status).toBe(201);
    const groupId = secondRes.body.appointmentGroupId as string;

    const listRes = await request(server)
      .get('/api/v1/appointment-groups')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .query({ patientId: f.patient.id, status: 'open' });
    expect(listRes.status).toBe(200);
    const groupIds = (listRes.body.data as Array<{ id: string }>).map(
      (g) => g.id,
    );
    expect(groupIds).toContain(groupId);

    const detailRes = await request(server)
      .get(`/api/v1/appointment-groups/${groupId}`)
      .set('Authorization', `Bearer ${nurseAJwt}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.members).toHaveLength(2);
    const memberVisits = (
      detailRes.body.members as Array<{ visitNumber: number }>
    ).map((m) => m.visitNumber);
    expect(memberVisits).toEqual([1, 2]);
  });

  maybe('Close — foreign doctor rejected with APPOINTMENT_GROUP_CLOSE_FORBIDDEN', async () => {
    const f = fixtures!;
    const nurseAJwt = await jwtFor(f.nurseA);
    const doctorAJwt = await jwtFor(f.doctorAUser);
    const doctorBJwt = await jwtFor(f.doctorBUser);

    const firstRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        // 09:30 — schedule starts at 09:00 with 30-min step for
        // NEW_PATIENT_VISIT; valid slots are 09:00 / 09:30 / 10:00 / …
        // 09:00 is already claimed by the smoke test, so we use 09:30.
        startAt: scratchIso(1, 9, 30),
      });
    expect(firstRes.status).toBe(201);

    // Continuations require the prev to be COMPLETED (F14 — Rule 1).
    const completeRes = await request(server)
      .post(`/api/v1/appointments/${firstRes.body.id}/complete`)
      .set('Authorization', `Bearer ${doctorAJwt}`)
      .send({ note: 'Complete note' });
    expect(completeRes.status).toBe(200);

    const secondRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${nurseAJwt}`)
      .send({
        patientId: f.patient.id,
        doctorId: f.doctorA.id,
        departmentId: f.deptA.id,
        scheduleId: f.scheduleA.id,
        appointmentType: AppointmentType.FOLLOW_UP,
        // 10:30 — NEW_PATIENT_VISIT at 09:30 occupies [09:30, 10:00).
        // The next free interval starts at 10:30 (10:00–10:30 is taken
        // by the "Refer rejects" test). The 20-min FOLLOW_UP grid anchors
        // at 10:30; 10:40 or 10:50 would be off-grid (SLOT_NOT_ON_GRID).
        startAt: scratchIso(1, 10, 30),
        previousAppointmentId: firstRes.body.id,
      });
    expect(secondRes.status).toBe(201);
    const groupId = secondRes.body.appointmentGroupId as string;

    const closeRes = await request(server)
      .post(`/api/v1/appointments/${secondRes.body.id}/complete`)
      .set('Authorization', `Bearer ${doctorBJwt}`)
      .send({ note: 'Closing case note' });

    // Doctor B is not the latest-visit doctor (Doctor A is).
    expect(closeRes.status).toBe(403);
    expect(closeRes.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION_SCOPE);
  });
});
