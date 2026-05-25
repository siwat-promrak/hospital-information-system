/**
 * End-to-end coverage for F07 — `/appointment-types` + `/slots`.
 *
 * Mirrors the F06 suite shape (real Nest app + seeded Postgres, skip
 * gracefully when the DB is unreachable). What's covered:
 *
 *  - `GET /appointment-types` returns the 4-row catalog with the canonical
 *    durations (NEW_PATIENT_VISIT=30 / FOLLOW_UP=15 / CONSULTATION=20 /
 *    PROCEDURE=60).
 *  - `GET /appointment-types` returns 403 for ADMIN (no
 *    `appointment.create` by default).
 *  - `GET /slots` returns chronologically-sorted slots whose step equals
 *    the requested type's `durationMinutes`.
 *  - A `BOOKED` appointment intersecting a slot excludes that slot.
 *  - A `CANCELLED` appointment intersecting a slot does NOT exclude it
 *    (US-6.2: cancel frees the slot for immediate reuse).
 *  - Slots starting at or before `now` are excluded; a fully-past `date`
 *    parameter returns `[]` with HTTP 200 (never 400).
 *  - `(departmentId, type)` not in `department_appointment_types` returns
 *    `400 DEPARTMENT_TYPE_NOT_ALLOWED`.
 *  - Unknown doctor id returns `404 NOT_FOUND`.
 *  - Caller without `appointment.create` (ADMIN by default) is rejected
 *    with `403 INSUFFICIENT_PERMISSION`.
 *  - DTO rejects malformed `date` / missing `doctorId` / missing
 *    `departmentId` / malformed `doctorId` / invalid `type` with `400
 *    VALIDATION_FAILED`.
 *
 * Fixtures: each test run creates scratch user / doctor / department /
 * department-appointment-type / schedule rows so the suite is independent
 * of the seed dataset (and idempotent on rerun).
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AppointmentStatus,
  AppointmentType,
  type Department,
  type Doctor,
  type User,
} from '@prisma/client';
import type { Server } from 'node:http';
import request from 'supertest';

import { ROLE } from '../src/auth/roles';
import { AppModule } from '../src/app.module';
import { ErrorCode } from '../src/common/errors';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { normalizeEmail } from '../src/common/normalize-email';
import { PrismaService } from '../src/prisma/prisma.service';

import { signTestJwt } from './utils/sign-jwt';

const NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ?? 'dev-nextauth-secret-change-me';

const NURSE_EMAIL = 'slots-nurse-e2e@gmail.com';
const ADMIN_EMAIL = 'slots-admin-e2e@gmail.com';
const DOCTOR_USER_EMAIL = 'slots-doctor-e2e@gmail.com';

const DEPT_PRIMARY_NAME = 'Slots E2E Dept Primary';
const DEPT_WITHOUT_TYPE_NAME = 'Slots E2E Dept Without Procedure';

/**
 * Scratch patient identifier prefix — used in the patient's
 * `identificationNo` column (freeform) so teardown can match by substring.
 * Distinct from the email so a unique-email collision after an aborted
 * test run still leaves a deletable row.
 */
const SCRATCH_PATIENT_ID_PREFIX = 'slots-e2e-pid-';

interface UserWithRole {
  user: User;
  roleCode: string;
}

interface Fixtures {
  nurse: UserWithRole;
  admin: UserWithRole;
  doctorUser: UserWithRole;
  doctor: Doctor;
  deptPrimary: Department;
  deptWithoutType: Department;
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
  const adminRole = await prisma.role.findUnique({
    where: { code: ROLE.ADMIN },
  });
  const nurseRole = await prisma.role.findUnique({
    where: { code: ROLE.NURSE },
  });
  const doctorRole = await prisma.role.findUnique({
    where: { code: ROLE.DOCTOR },
  });
  const superAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@gmail.com' },
  });

  if (!adminRole || !nurseRole || !doctorRole || !superAdmin) {
    return null;
  }

  await teardownFixturesByNames(prisma);

  // Departments come first — every scoped role needs a non-null
  // `User.departmentId`, and the doctor needs a `Doctor.departmentId`.
  const deptPrimary = await prisma.department.create({
    data: {
      name: DEPT_PRIMARY_NAME,
      description: 'F07 e2e scratch department (offers every appointment type)',
      createdBy: superAdmin.id,
    },
  });

  const deptWithoutType = await prisma.department.create({
    data: {
      name: DEPT_WITHOUT_TYPE_NAME,
      description: 'F07 e2e scratch department (only CONSULTATION offered)',
      createdBy: superAdmin.id,
    },
  });

  const nurse: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(NURSE_EMAIL),
        firstNameEn: 'Slot',
        lastNameEn: 'Nurse',
        roleId: nurseRole.id,
        departmentId: deptPrimary.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.NURSE,
  };

  const admin: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(ADMIN_EMAIL),
        firstNameEn: 'Slot',
        lastNameEn: 'Admin',
        roleId: adminRole.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.ADMIN,
  };

  const doctorUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_USER_EMAIL),
        firstNameEn: 'Slot',
        lastNameEn: 'Doctor',
        roleId: doctorRole.id,
        departmentId: deptPrimary.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  const stamp = Date.now().toString(36).slice(-6);

  // Post-Item-3: Doctor inherits its department from the linked User row
  // (`User.departmentId`, set above on the doctorUser upsert). No
  // `departmentId` on the Doctor create.
  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.user.id,
      doctorCode: `SLOTS-E2E-${stamp}`,
      identificationNo: `slots-e2e-${stamp}`,
      medicalLicenseNo: `MED-SLOTS-${stamp}`,
      phone: '+66-2-000-9999',
      createdBy: superAdmin.id,
    },
  });

  // deptPrimary offers every type EXCEPT PROCEDURE — keeps the happy-
  // path tests (CONSULTATION / 20-min step) working AND lets the NURSE
  // exercise `DEPARTMENT_TYPE_NOT_ALLOWED` for `(deptPrimary, PROCEDURE)`
  // without crossing a department boundary first (which would short-
  // circuit on the scope guard).
  for (const appointmentType of [
    AppointmentType.NEW_PATIENT_VISIT,
    AppointmentType.FOLLOW_UP,
    AppointmentType.CONSULTATION,
  ]) {
    await prisma.departmentAppointmentType.create({
      data: {
        departmentId: deptPrimary.id,
        appointmentType,
        createdBy: superAdmin.id,
      },
    });
  }

  // deptWithoutType only offers CONSULTATION — used by the cross-
  // department admin probe paths if any.
  await prisma.departmentAppointmentType.create({
    data: {
      departmentId: deptWithoutType.id,
      appointmentType: AppointmentType.CONSULTATION,
      createdBy: superAdmin.id,
    },
  });

  return {
    nurse,
    admin,
    doctorUser,
    doctor,
    deptPrimary,
    deptWithoutType,
    superAdminId: superAdmin.id,
  };
}

async function teardownFixturesByNames(prisma: PrismaService): Promise<void> {
  const emails = [
    normalizeEmail(NURSE_EMAIL),
    normalizeEmail(ADMIN_EMAIL),
    normalizeEmail(DOCTOR_USER_EMAIL),
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
    where: {
      name: { in: [DEPT_PRIMARY_NAME, DEPT_WITHOUT_TYPE_NAME] },
    },
    select: { id: true },
  });
  const departmentIds = departments.map((d) => d.id);

  // Scratch patients (used by the appointment-blocker test). Identified
  // via the `identificationNo` prefix so a unique-email-collision across
  // aborted runs still leaves a deletable row.
  const patients = await prisma.patient.findMany({
    where: { identificationNo: { startsWith: SCRATCH_PATIENT_ID_PREFIX } },
    select: { id: true },
  });
  const patientIds = patients.map((p) => p.id);

  // Appointments first (no soft-delete cluster — hard delete).
  await prisma.appointment.deleteMany({
    where: {
      OR: [
        { doctorId: { in: doctorIds } },
        { patientId: { in: patientIds } },
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

  // Users carry `departmentId` FK now, so they MUST be deleted before
  // their department rows.
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.department.deleteMany({
    where: { id: { in: departmentIds } },
  });
}

/**
 * UTC datetime helper anchored to a far-future test date so every slot
 * the suite computes is comfortably "in the future" relative to the
 * server's clock (the BE drops slots whose `startAt <= now`).
 */
const SCHEDULE_YEAR = 2099;
const SCHEDULE_MONTH = 7;
const SCHEDULE_DAY = 14;
const SCHEDULE_DATE_ISO = '2099-07-14';

function slotIso(hour: number, minute: number = 0): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');

  return `${SCHEDULE_YEAR}-${pad(SCHEDULE_MONTH)}-${pad(SCHEDULE_DAY)}T${pad(hour)}:${pad(minute)}:00.000Z`;
}

function slotDate(hour: number, minute: number = 0): Date {
  return new Date(slotIso(hour, minute));
}

describe('F07 — appointment types + slot finder e2e', () => {
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
      {
        userId: entry.user.id,
        roleCode: entry.roleCode,
        email: entry.user.email,
      },
      NEXTAUTH_SECRET,
    );

  // ─── /appointment-types ────────────────────────────────────────────────────

  maybe('STAFF: GET /appointment-types returns the canonical 4-row catalog', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get('/api/v1/appointment-types')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(4);

    const byCode = new Map<string, { label: string; durationMinutes: number }>();

    for (const row of res.body) {
      byCode.set(row.code, {
        label: row.label,
        durationMinutes: row.durationMinutes,
      });
    }

    expect(byCode.get(AppointmentType.NEW_PATIENT_VISIT)?.durationMinutes).toBe(30);
    expect(byCode.get(AppointmentType.FOLLOW_UP)?.durationMinutes).toBe(15);
    expect(byCode.get(AppointmentType.CONSULTATION)?.durationMinutes).toBe(20);
    expect(byCode.get(AppointmentType.PROCEDURE)?.durationMinutes).toBe(60);

    // Sanity-check the label shape (English non-empty string).
    for (const entry of byCode.values()) {
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  maybe('ADMIN: GET /appointment-types returns 403 INSUFFICIENT_PERMISSION', async () => {
    const jwt = await jwtFor(fixtures!.admin);

    const res = await request(server)
      .get('/api/v1/appointment-types')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION);
  });

  // ─── /slots — happy path ────────────────────────────────────────────────────

  maybe('STAFF: GET /slots returns chronological 20-min slots for CONSULTATION', async () => {
    // Seed a 09:00–10:00 schedule on the test day so the response is
    // deterministic. Far-future date → every slot is comfortably in the
    // future.
    const happySchedule = await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctor.id,
        departmentId: fixtures!.deptPrimary.id,
        startAt: slotDate(9, 0),
        endAt: slotDate(10, 0),
        createdBy: fixtures!.superAdminId,
      },
    });

    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=${fixtures!.doctor.id}&departmentId=${fixtures!.deptPrimary.id}&date=${SCHEDULE_DATE_ISO}&type=${AppointmentType.CONSULTATION}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        startAt: slotIso(9, 0),
        endAt: slotIso(9, 20),
        departmentId: fixtures!.deptPrimary.id,
        scheduleId: happySchedule.id,
      },
      {
        startAt: slotIso(9, 20),
        endAt: slotIso(9, 40),
        departmentId: fixtures!.deptPrimary.id,
        scheduleId: happySchedule.id,
      },
      {
        startAt: slotIso(9, 40),
        endAt: slotIso(10, 0),
        departmentId: fixtures!.deptPrimary.id,
        scheduleId: happySchedule.id,
      },
    ]);

    // Every returned slot must carry the owning schedule id (F09 provenance).
    for (const slot of res.body) {
      expect(slot.scheduleId).toBe(happySchedule.id);
    }

    // Sanity-check the step matches the requested type's duration (20 min
    // for CONSULTATION) — equivalent to the unit test but verifies the
    // entire pipeline plumbs the right value end-to-end.
    const startMs = new Date(res.body[1].startAt).getTime();
    const prevMs = new Date(res.body[0].startAt).getTime();
    expect(startMs - prevMs).toBe(20 * 60_000);
  });

  // ─── /slots — exclusion rules ──────────────────────────────────────────────

  maybe('STAFF: a BOOKED appointment excludes its slot', async () => {
    // Fresh schedule on +1h so it does not collide with the earlier
    // 09:00–10:00 window for this same doctor / dept.
    const blockerSchedule = await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctor.id,
        departmentId: fixtures!.deptPrimary.id,
        startAt: slotDate(11, 0),
        endAt: slotDate(12, 0),
        createdBy: fixtures!.superAdminId,
      },
    });

    // Block the 11:20–11:40 slot with a BOOKED appointment.
    await prisma.appointment.create({
      data: {
        patientId: await ensureScratchPatient(prisma, fixtures!.superAdminId),
        doctorId: fixtures!.doctor.id,
        departmentId: fixtures!.deptPrimary.id,
        scheduleId: blockerSchedule.id,
        appointmentType: AppointmentType.CONSULTATION,
        status: AppointmentStatus.BOOKED,
        startAt: slotDate(11, 20),
        endAt: slotDate(11, 40),
        createdBy: fixtures!.superAdminId,
      },
    });

    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=${fixtures!.doctor.id}&departmentId=${fixtures!.deptPrimary.id}&date=${SCHEDULE_DATE_ISO}&type=${AppointmentType.CONSULTATION}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    const starts = res.body.map((s: { startAt: string }) => s.startAt);

    expect(starts).toContain(slotIso(11, 0));
    expect(starts).not.toContain(slotIso(11, 20));
    expect(starts).toContain(slotIso(11, 40));
  });

  maybe('STAFF: a CANCELLED appointment does NOT exclude its slot', async () => {
    // Schedule 13:00–14:00 for this case.
    const cancelledSchedule = await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctor.id,
        departmentId: fixtures!.deptPrimary.id,
        startAt: slotDate(13, 0),
        endAt: slotDate(14, 0),
        createdBy: fixtures!.superAdminId,
      },
    });

    // CANCELLED appointment over the 13:20–13:40 slot — slot must remain.
    await prisma.appointment.create({
      data: {
        patientId: await ensureScratchPatient(prisma, fixtures!.superAdminId),
        doctorId: fixtures!.doctor.id,
        departmentId: fixtures!.deptPrimary.id,
        scheduleId: cancelledSchedule.id,
        appointmentType: AppointmentType.CONSULTATION,
        status: AppointmentStatus.CANCELLED,
        startAt: slotDate(13, 20),
        endAt: slotDate(13, 40),
        createdBy: fixtures!.superAdminId,
        cancelledBy: fixtures!.superAdminId,
        cancelledAt: new Date(),
      },
    });

    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=${fixtures!.doctor.id}&departmentId=${fixtures!.deptPrimary.id}&date=${SCHEDULE_DATE_ISO}&type=${AppointmentType.CONSULTATION}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    const starts = res.body.map((s: { startAt: string }) => s.startAt);

    expect(starts).toContain(slotIso(13, 20));
  });

  maybe('STAFF: a fully-past date returns [] (200, not 400)', async () => {
    // Seed a schedule on a year-2000 day — fully past relative to "now".
    await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctor.id,
        departmentId: fixtures!.deptPrimary.id,
        startAt: new Date('2000-01-15T09:00:00.000Z'),
        endAt: new Date('2000-01-15T12:00:00.000Z'),
        createdBy: fixtures!.superAdminId,
      },
    });

    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=${fixtures!.doctor.id}&departmentId=${fixtures!.deptPrimary.id}&date=2000-01-15&type=${AppointmentType.CONSULTATION}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ─── /slots — validation / error codes ─────────────────────────────────────

  maybe('NURSE: mismatched (departmentId, type) returns 400 DEPARTMENT_TYPE_NOT_ALLOWED', async () => {
    // deptPrimary offers every type EXCEPT PROCEDURE — query stays inside
    // the NURSE's own department so the scope guard passes and the type
    // check is the first thing to trip.
    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=${fixtures!.doctor.id}&departmentId=${fixtures!.deptPrimary.id}&date=${SCHEDULE_DATE_ISO}&type=${AppointmentType.PROCEDURE}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.DEPARTMENT_TYPE_NOT_ALLOWED);
    expect(res.body.details).toEqual(
      expect.objectContaining({
        departmentId: fixtures!.deptPrimary.id,
        appointmentType: AppointmentType.PROCEDURE,
      }),
    );
  });

  maybe('STAFF: unknown doctor id returns 404 NOT_FOUND', async () => {
    // Use a well-formed UUID v4 that does not match any seeded / scratch
    // doctor — class-validator's `@IsUUID()` rejects all-zero / all-`a`
    // strings because they don't carry a version digit in the expected
    // position, so the test would otherwise short-circuit on validation
    // instead of reaching the doctor-existence check.
    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=00000000-0000-4000-8000-000000000000&departmentId=${fixtures!.deptPrimary.id}&date=${SCHEDULE_DATE_ISO}&type=${AppointmentType.CONSULTATION}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  maybe('ADMIN: GET /slots returns 403 INSUFFICIENT_PERMISSION', async () => {
    const jwt = await jwtFor(fixtures!.admin);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=${fixtures!.doctor.id}&departmentId=${fixtures!.deptPrimary.id}&date=${SCHEDULE_DATE_ISO}&type=${AppointmentType.CONSULTATION}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION);
  });

  maybe('STAFF: malformed date returns 400 VALIDATION_FAILED', async () => {
    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=${fixtures!.doctor.id}&departmentId=${fixtures!.deptPrimary.id}&date=not-a-date&type=${AppointmentType.CONSULTATION}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  maybe('STAFF: missing doctorId returns 400 VALIDATION_FAILED', async () => {
    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?departmentId=${fixtures!.deptPrimary.id}&date=${SCHEDULE_DATE_ISO}&type=${AppointmentType.CONSULTATION}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  maybe('STAFF: malformed doctorId (not a uuid) returns 400 VALIDATION_FAILED', async () => {
    // The old path-param form used `ParseUUIDPipe` to reject this; the
    // query-param form leans on class-validator's `@IsUUID()` for the
    // same coverage, surfacing as `400 VALIDATION_FAILED`.
    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=not-a-uuid&departmentId=${fixtures!.deptPrimary.id}&date=${SCHEDULE_DATE_ISO}&type=${AppointmentType.CONSULTATION}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  maybe('STAFF: missing departmentId returns 400 VALIDATION_FAILED', async () => {
    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=${fixtures!.doctor.id}&date=${SCHEDULE_DATE_ISO}&type=${AppointmentType.CONSULTATION}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  maybe('STAFF: invalid type (not in enum) returns 400 VALIDATION_FAILED', async () => {
    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .get(
        `/api/v1/slots?doctorId=${fixtures!.doctor.id}&departmentId=${fixtures!.deptPrimary.id}&date=${SCHEDULE_DATE_ISO}&type=NOT_A_REAL_TYPE`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });
});

/**
 * Helper — make sure ONE scratch patient row exists we can use to
 * `createdBy = superAdmin` an Appointment. The patient table requires a
 * sizable demographic payload, so we cache the id on the prisma client
 * after the first creation in this suite.
 */
let scratchPatientId: string | null = null;

async function ensureScratchPatient(
  prisma: PrismaService,
  createdBy: string,
): Promise<string> {
  if (scratchPatientId) {
    return scratchPatientId;
  }

  const stamp = Date.now();
  const patient = await prisma.patient.create({
    data: {
      hn: deriveScratchHn(),
      firstNameEn: 'Slots',
      lastNameEn: 'TestPatient',
      identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${stamp}`,
      phone: '+66-2-555-0000',
      // No email — avoids the unique constraint clashing across reruns.
      dateOfBirth: new Date('1980-01-01T00:00:00.000Z'),
      gender: 'MALE',
      emergencyPersonName: 'Emergency Contact',
      emergencyPersonRelation: 'Spouse',
      emergencyPersonPhone: '+66-2-555-0001',
      address: '123 Example Road',
      createdBy,
    },
  });

  scratchPatientId = patient.id;

  return patient.id;
}

/**
 * Mint a HN that satisfies the `^[0-9]{7,9}$` CHECK without colliding
 * with the 10-row baseline (`26000001`…`26000010`). Uses the current ms
 * timestamp slice so reruns produce a fresh value.
 */
function deriveScratchHn(): string {
  const ts = Date.now().toString();

  return ts.slice(-9);
}
