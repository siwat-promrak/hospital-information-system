/**
 * End-to-end coverage for F06 doctor schedule CRUD (v2 — dated windows).
 * Mirrors the F02 suite shape: tests run against the real Nest app + seeded
 * Postgres, but the whole suite skips gracefully when the DB is unreachable
 * so CI without Docker still passes.
 *
 * What is covered:
 *  - STAFF create → 201 + `ScheduleResponseDto` shape (ISO datetimes).
 *  - STAFF create overlap → 409 SCHEDULE_OVERLAP + `conflictingScheduleId`.
 *  - STAFF create with mismatched department → 409 DOCTOR_NOT_IN_DEPARTMENT.
 *  - STAFF list with `?from=&to=` returns only schedules in the range.
 *  - STAFF list with no range — defaults to current calendar month.
 *  - DOCTOR list is auto-scoped to own schedules.
 *  - DOCTOR PATCH of a foreign schedule → 403 INSUFFICIENT_PERMISSION_SCOPE.
 *  - DOCTOR GET of a foreign `/:id` → 404 (no existence leak).
 *  - ADMIN (no `schedule.manage` by default) → 403 INSUFFICIENT_PERMISSION.
 *  - DELETE then GET → 404 SCHEDULE_NOT_FOUND.
 *  - DTO validation rejects `endAt <= startAt`, break outside window, half-
 *    set break fields.
 *
 * Fixtures: F01 does NOT seed any Doctor rows, so each test run creates its
 * own scratch doctors / departments / users via Prisma and cleans up at the
 * end. Schedule windows pick dates well into the future and on different
 * calendar days so the suite is order-independent and free of accidental
 * overlap across cases.
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

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'dev-nextauth-secret-change-me';

const NURSE_EMAIL = 'schedule-nurse-e2e@gmail.com';
const ADMIN_EMAIL = 'schedule-admin-e2e@gmail.com';
const DOCTOR_USER_EMAIL = 'schedule-doctor-own-e2e@gmail.com';
const DOCTOR_OTHER_USER_EMAIL = 'schedule-doctor-other-e2e@gmail.com';

const DEPT_ONE_NAME = 'Schedule E2E Dept One';
const SCHEDULE_E2E_DEPT_TWO_NAME = 'Schedule E2E Dept Two';

// All scratch schedule rows live in this far-future month so test runs are
// deterministic regardless of when "now" is. The list-range test passes
// the matching `?from=&to=` window explicitly.
const SCHEDULE_RANGE_YEAR = 2099;
const SCHEDULE_RANGE_MONTH = 6; // June

// Distinctive name + code fragments used by the doctorOwn scratch row so
// `GET /doctors?q=` substring tests target it without colliding with the
// 75 MD-* seeded rows. Uppercase EN names exercise case-insensitivity.
const SEARCH_DOCTOR_FIRST_NAME_EN = 'Zylphara';
const SEARCH_DOCTOR_LAST_NAME_EN = 'Quintessence';
const SEARCH_DOCTOR_FIRST_NAME_TH = 'จันทรเกษม';
const SEARCH_DOCTOR_LAST_NAME_TH = 'แสนสิริ';
const SEARCH_DOCTOR_CODE_PREFIX = 'E2E-SRCH';

// Distinctive id prefix for the scratch patient row spun up by the
// SCHEDULE_HAS_APPOINTMENTS guard test. Used by teardown to scope the
// patient cleanup without colliding with other suites' patient rows.
const SCHED_APPT_PATIENT_ID_PREFIX = 'sched-appt-e2e-pid-';

interface UserWithRole {
  user: User;
  roleCode: string;
}

interface Fixtures {
  nurse: UserWithRole;
  admin: UserWithRole;
  doctorOwnUser: UserWithRole;
  doctorOtherUser: UserWithRole;
  doctorOwn: Doctor;
  doctorOther: Doctor;
  deptOne: Department;
  deptTwo: Department;
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
  const adminRole = await prisma.role.findUnique({ where: { code: ROLE.ADMIN } });
  const nurseRole = await prisma.role.findUnique({ where: { code: ROLE.NURSE } });
  const doctorRole = await prisma.role.findUnique({ where: { code: ROLE.DOCTOR } });
  const superAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@gmail.com' },
  });

  if (!adminRole || !nurseRole || !doctorRole || !superAdmin) {
    return null;
  }

  await teardownFixturesByNames(prisma);

  // Departments seeded first — scoped users need a non-null departmentId
  // and the Doctor rows need departmentId too (1:1 with Department).
  const deptOne = await prisma.department.create({
    data: {
      name: DEPT_ONE_NAME,
      description: 'E2E scratch dept',
      createdBy: superAdmin.id,
    },
  });

  const deptTwo = await prisma.department.create({
    data: {
      name: SCHEDULE_E2E_DEPT_TWO_NAME,
      description: 'E2E scratch dept',
      createdBy: superAdmin.id,
    },
  });

  const nurse: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(NURSE_EMAIL),
        firstNameEn: 'Sched',
        lastNameEn: 'Nurse',
        roleId: nurseRole.id,
        departmentId: deptOne.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.NURSE,
  };

  const admin: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(ADMIN_EMAIL),
        firstNameEn: 'Sched',
        lastNameEn: 'Admin',
        roleId: adminRole.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.ADMIN,
  };

  const doctorOwnUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_USER_EMAIL),
        // Distinctive EN + TH names so the `GET /doctors?q=` substring
        // filter tests can target this row unambiguously against the 75
        // seeded MD-* doctors.
        firstNameEn: SEARCH_DOCTOR_FIRST_NAME_EN,
        lastNameEn: SEARCH_DOCTOR_LAST_NAME_EN,
        firstNameTh: SEARCH_DOCTOR_FIRST_NAME_TH,
        lastNameTh: SEARCH_DOCTOR_LAST_NAME_TH,
        roleId: doctorRole.id,
        departmentId: deptOne.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  const doctorOtherUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_OTHER_USER_EMAIL),
        firstNameEn: 'Doc',
        lastNameEn: 'Other',
        roleId: doctorRole.id,
        departmentId: deptTwo.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  // Unique-ish doctor codes / license numbers per test run (high enough to
  // never collide with future seeders).
  const stamp = Date.now().toString(36).slice(-6);

  // doctorOwn is anchored in deptOne; doctorOther in deptTwo. The Doctor
  // table now carries `departmentId` directly (1:1) — no M:N join row.
  // Post-Item-3 the doctor's department lives only on `User.departmentId`
  // (the upserts above already populate it) — `Doctor` no longer carries
  // its own `department_id` column.
  const doctorOwn = await prisma.doctor.create({
    data: {
      userId: doctorOwnUser.user.id,
      // Code prefix kept stable across runs (after teardown) so the
      // `?q=E2E-SRCH-…` assertion can match by substring without knowing
      // the per-run stamp.
      doctorCode: `${SEARCH_DOCTOR_CODE_PREFIX}-${stamp}`,
      identificationNo: `e2e-own-${stamp}`,
      medicalLicenseNo: `MED-OWN-${stamp}`,
      phone: '+66-2-000-0001',
      createdBy: superAdmin.id,
    },
  });

  const doctorOther = await prisma.doctor.create({
    data: {
      userId: doctorOtherUser.user.id,
      doctorCode: `E2E-OTH-${stamp}`,
      identificationNo: `e2e-oth-${stamp}`,
      medicalLicenseNo: `MED-OTH-${stamp}`,
      phone: '+66-2-000-0002',
      createdBy: superAdmin.id,
    },
  });

  return {
    nurse,
    admin,
    doctorOwnUser,
    doctorOtherUser,
    doctorOwn,
    doctorOther,
    deptOne,
    deptTwo,
    superAdminId: superAdmin.id,
  };
}

async function teardownFixturesByNames(prisma: PrismaService): Promise<void> {
  const emails = [
    normalizeEmail(NURSE_EMAIL),
    normalizeEmail(ADMIN_EMAIL),
    normalizeEmail(DOCTOR_USER_EMAIL),
    normalizeEmail(DOCTOR_OTHER_USER_EMAIL),
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
    where: { name: { in: [DEPT_ONE_NAME, SCHEDULE_E2E_DEPT_TWO_NAME] } },
    select: { id: true },
  });
  const departmentIds = departments.map((d) => d.id);

  // Appointments + the scratch patient created by the
  // SCHEDULE_HAS_APPOINTMENTS guard test must drop BEFORE the schedules
  // they reference (Appointment.scheduleId is a non-null FK).
  await prisma.appointment.deleteMany({
    where: {
      OR: [
        { doctorId: { in: doctorIds } },
        { departmentId: { in: departmentIds } },
      ],
    },
  });

  await prisma.patient.deleteMany({
    where: { identificationNo: { startsWith: SCHED_APPT_PATIENT_ID_PREFIX } },
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

  // Users carry `departmentId` FK now, so they MUST be deleted before
  // their department rows. Auth-log rows hold FKs to the test users too.
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
}

/**
 * Build a UTC ISO datetime string in the scratch month (`2099-06-DD HH:00Z`).
 * Helper keeps the test bodies readable.
 */
function scheduleIso(day: number, hour: number, minute: number = 0): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');

  return `${SCHEDULE_RANGE_YEAR}-${pad(SCHEDULE_RANGE_MONTH)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00.000Z`;
}

function scheduleDate(day: number, hour: number, minute: number = 0): Date {
  return new Date(scheduleIso(day, hour, minute));
}

describe('F06 — Doctor schedule CRUD e2e (v2 dated windows)', () => {
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

  // ─── STAFF create + overlap + cross-department rejection ────────────────────

  maybe('STAFF creates a schedule (201) and returns ISO ScheduleResponseDto', async () => {
    const jwt = await jwtFor(fixtures!.nurse);
    const startAt = scheduleIso(1, 9);
    const endAt = scheduleIso(1, 12);
    const breakStartAt = scheduleIso(1, 10);
    const breakEndAt = scheduleIso(1, 11);

    const res = await request(server)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt,
        endAt,
        breakStartAt,
        breakEndAt,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.doctorId).toBe(fixtures!.doctorOwn.id);
    expect(res.body.departmentId).toBe(fixtures!.deptOne.id);
    expect(res.body.startAt).toBe(startAt);
    expect(res.body.endAt).toBe(endAt);
    expect(res.body.breakStartAt).toBe(breakStartAt);
    expect(res.body.breakEndAt).toBe(breakEndAt);
    expect(res.body.acceptsBooking).toBe(true);
    expect(typeof res.body.createdAt).toBe('string');
    expect(typeof res.body.updatedAt).toBe('string');
    expect(res.body.doctor).toEqual(
      expect.objectContaining({
        id: fixtures!.doctorOwn.id,
        doctorCode: fixtures!.doctorOwn.doctorCode,
      }),
    );
    expect(res.body.department).toEqual(
      expect.objectContaining({ id: fixtures!.deptOne.id, name: DEPT_ONE_NAME }),
    );
  });

  maybe('STAFF cannot create an overlapping schedule (409 SCHEDULE_OVERLAP)', async () => {
    const jwt = await jwtFor(fixtures!.nurse);
    // Overlaps the 09:00–12:00 window created in the previous test (11:00–13:00).
    const res = await request(server)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: scheduleIso(1, 11),
        endAt: scheduleIso(1, 13),
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(ErrorCode.SCHEDULE_OVERLAP);
    expect(res.body.details.conflictingScheduleId).toEqual(expect.any(String));
  });

  maybe('NURSE cannot create a schedule with a foreign department (403 INSUFFICIENT_PERMISSION_SCOPE)', async () => {
    const jwt = await jwtFor(fixtures!.nurse);
    // Disjoint day so it cannot collide with anything created earlier.
    // doctorOwn is anchored in deptOne; the NURSE is also in deptOne.
    // Submitting `departmentId: deptTwo` trips the NURSE scope guard before
    // the doctor-department-mismatch check even runs (the scope guard runs
    // first because it is cheaper than the DB read).
    const res = await request(server)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptTwo.id,
        startAt: scheduleIso(2, 9),
        endAt: scheduleIso(2, 12),
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION_SCOPE);
  });

  // ─── Bug-fix coverage: per-verb scope on POST /schedules ──────────────────
  //
  // Pre-fix the scope guard collapsed READ + CREATE permissions into a single
  // "widest scope" lookup, so a DOCTOR (holds `schedule.read.own-department`
  // for cross-coverage visibility) could create a schedule for ANOTHER
  // doctor in the same department. The two cases below pin the per-verb
  // resolver in place.
  maybe('DOCTOR cannot create a schedule for ANOTHER doctor (even in their own department) — per-verb scope guard', async () => {
    // Mint a sibling doctor under the doctorOwn user's own department
    // (deptOne) so the failure is unambiguously "scope.own", NOT
    // "DOCTOR_DEPARTMENT_MISMATCH". The fresh row carries its own user
    // (UNIQUE userId on Doctor) so it survives the per-suite teardown.
    const stamp = Date.now().toString(36).slice(-6);
    const peerDoctorUser = await prisma.user.create({
      data: {
        email: normalizeEmail(`schedule-doctor-peer-${stamp}@gmail.com`),
        firstNameEn: 'Peer',
        lastNameEn: 'Doctor',
        roleId: fixtures!.doctorOwnUser.user.roleId!,
        departmentId: fixtures!.deptOne.id,
        createdBy: fixtures!.superAdminId,
      },
    });

    const peerDoctor = await prisma.doctor.create({
      data: {
        userId: peerDoctorUser.id,
        // departmentId removed (Item-3): Doctor inherits via User.departmentId.
        doctorCode: `E2E-PEER-${stamp}`,
        identificationNo: `e2e-peer-${stamp}`,
        medicalLicenseNo: `MED-PEER-${stamp}`,
        phone: '+66-2-000-0003',
        createdBy: fixtures!.superAdminId,
      },
    });

    try {
      const jwt = await jwtFor(fixtures!.doctorOwnUser);
      const res = await request(server)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          doctorId: peerDoctor.id,
          departmentId: fixtures!.deptOne.id,
          startAt: scheduleIso(15, 9),
          endAt: scheduleIso(15, 12),
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION_SCOPE);
      expect(res.body.details).toEqual(
        expect.objectContaining({
          required: ['schedule.create.own-department'],
          scope: 'own',
          requestedDoctorId: peerDoctor.id,
          ownDoctorId: fixtures!.doctorOwn.id,
        }),
      );
    } finally {
      // Best-effort cleanup so re-runs of this test do not collide on the
      // peer rows. Schedules + doctor + user, in that order (FKs).
      await prisma.doctorSchedule.deleteMany({ where: { doctorId: peerDoctor.id } });
      await prisma.doctor.deleteMany({ where: { id: peerDoctor.id } });
      await prisma.user.deleteMany({ where: { id: peerDoctorUser.id } });
    }
  });

  maybe('NURSE cannot create a schedule for a doctor in a FOREIGN department (per-verb scope guard)', async () => {
    // doctorOther is anchored in deptTwo; the NURSE lives in deptOne.
    // Submitting `departmentId: deptTwo` (the foreign dept) trips the
    // NURSE write-scope guard. The previous "foreign department" test
    // submits doctorOwn (deptOne) + deptTwo — i.e. exercises the case
    // where the body claims a dept the NURSE does not own. THIS test
    // exercises the case where the body asks to schedule a doctor in
    // ANOTHER department altogether (the more common attack shape).
    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        doctorId: fixtures!.doctorOther.id,
        departmentId: fixtures!.deptTwo.id,
        startAt: scheduleIso(16, 9),
        endAt: scheduleIso(16, 12),
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION_SCOPE);
    expect(res.body.details).toEqual(
      expect.objectContaining({
        required: ['schedule.create.own-department'],
        scope: 'own-department',
      }),
    );
  });

  // ─── List + filter ──────────────────────────────────────────────────────────

  maybe('STAFF lists schedules filtered by ?from=&to= range', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    // Seed two more rows on distinct days so we can assert the range filter
    // actually narrows. Rows live in the NURSE's own department (deptOne)
    // so the post-refactor scope guard does not filter them out.
    await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: scheduleDate(5, 9),
        endAt: scheduleDate(5, 12),
        createdBy: fixtures!.nurse.user.id,
      },
    });

    await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: scheduleDate(20, 9),
        endAt: scheduleDate(20, 12),
        createdBy: fixtures!.nurse.user.id,
      },
    });

    // Narrow window catches the day-5 row but excludes the day-20 row.
    const fromQ = `${SCHEDULE_RANGE_YEAR}-0${SCHEDULE_RANGE_MONTH}-04`;
    const toQ = `${SCHEDULE_RANGE_YEAR}-0${SCHEDULE_RANGE_MONTH}-06`;

    const res = await request(server)
      .get(`/api/v1/schedules?from=${fromQ}&to=${toQ}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);

    for (const row of res.body.data) {
      const rowStart = new Date(row.startAt).getTime();
      // Every returned row's startAt must fall on or after `from` 00:00Z.
      expect(rowStart).toBeGreaterThanOrEqual(new Date(`${fromQ}T00:00:00.000Z`).getTime());
      // And end on or before `to` 23:59:59.999Z (intersection contract).
      const rowEnd = new Date(row.endAt).getTime();
      expect(rowEnd).toBeLessThanOrEqual(new Date(`${toQ}T23:59:59.999Z`).getTime());
    }
  });

  maybe('STAFF list with no range defaults to current calendar month', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get('/api/v1/schedules')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);

    // The scratch rows live in 2099; the default window is the current
    // calendar month, so NONE of our scratch rows should leak in.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    for (const row of res.body.data) {
      const rowStart = new Date(row.startAt).getTime();
      expect(rowStart).toBeLessThan(nextMonthStart.getTime());
      const rowEnd = new Date(row.endAt).getTime();
      expect(rowEnd).toBeGreaterThan(monthStart.getTime());
    }
  });

  // ─── DOCTOR scope ───────────────────────────────────────────────────────────

  maybe('DOCTOR list is auto-scoped to own schedules', async () => {
    const jwt = await jwtFor(fixtures!.doctorOwnUser);

    // Use a wide range so we don't accidentally fall outside the default month.
    const fromQ = `${SCHEDULE_RANGE_YEAR}-0${SCHEDULE_RANGE_MONTH}-01`;
    const toQ = `${SCHEDULE_RANGE_YEAR}-0${SCHEDULE_RANGE_MONTH}-30`;

    const res = await request(server)
      .get(`/api/v1/schedules?from=${fromQ}&to=${toQ}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);

    for (const row of res.body.data) {
      expect(row.doctorId).toBe(fixtures!.doctorOwn.id);
    }
  });

  maybe('DOCTOR cannot PATCH a foreign schedule (403 INSUFFICIENT_PERMISSION_SCOPE)', async () => {
    // Create a schedule owned by doctorOther on day 10 (no collisions there).
    const foreign = await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctorOther.id,
        departmentId: fixtures!.deptTwo.id,
        startAt: scheduleDate(10, 9),
        endAt: scheduleDate(10, 12),
        createdBy: fixtures!.nurse.user.id,
      },
    });

    const jwt = await jwtFor(fixtures!.doctorOwnUser);
    const res = await request(server)
      .patch(`/api/v1/schedules/${foreign.id}`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ acceptsBooking: false });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION_SCOPE);
  });

  maybe('DOCTOR GET of a foreign /:id returns 404 (no existence leak)', async () => {
    // Reuse a doctorOther-owned row.
    const foreign = await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctorOther.id,
        departmentId: fixtures!.deptTwo.id,
        startAt: scheduleDate(11, 9),
        endAt: scheduleDate(11, 12),
        createdBy: fixtures!.nurse.user.id,
      },
    });

    const jwt = await jwtFor(fixtures!.doctorOwnUser);
    const res = await request(server)
      .get(`/api/v1/schedules/${foreign.id}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.SCHEDULE_NOT_FOUND);
  });

  // ─── ADMIN lacks schedule.manage by default ─────────────────────────────────

  maybe('ADMIN (no schedule.manage by default) is rejected with INSUFFICIENT_PERMISSION', async () => {
    const jwt = await jwtFor(fixtures!.admin);

    const res = await request(server)
      .get('/api/v1/schedules')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION);
  });

  // ─── DELETE then GET ────────────────────────────────────────────────────────

  maybe('DELETE then GET /:id returns 404 SCHEDULE_NOT_FOUND', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    // Fresh scratch row on day 25 — well clear of other test windows.
    const created = await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: scheduleDate(25, 9),
        endAt: scheduleDate(25, 12),
        createdBy: fixtures!.nurse.user.id,
      },
    });

    const del = await request(server)
      .delete(`/api/v1/schedules/${created.id}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(del.status).toBe(204);

    const get = await request(server)
      .get(`/api/v1/schedules/${created.id}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(get.status).toBe(404);
    expect(get.body.code).toBe(ErrorCode.SCHEDULE_NOT_FOUND);
  });

  // ─── SCHEDULE_HAS_APPOINTMENTS guard (update + delete) ─────────────────────

  maybe(
    'PATCH /:id is rejected with 409 SCHEDULE_HAS_APPOINTMENTS when a BOOKED appointment references the schedule (and DELETE on the same id is also rejected)',
    async () => {
      // Seed a fresh future schedule + one BOOKED appointment that
      // references it. Day 26 is well clear of every other test window.
      const schedule = await prisma.doctorSchedule.create({
        data: {
          doctorId: fixtures!.doctorOwn.id,
          departmentId: fixtures!.deptOne.id,
          startAt: scheduleDate(26, 9),
          endAt: scheduleDate(26, 12),
          createdBy: fixtures!.nurse.user.id,
        },
      });

      const patientStamp = Date.now().toString();
      const patient = await prisma.patient.create({
        data: {
          // hn must be 9 chars per the seeded-pattern helper; pad here too.
          hn: patientStamp.padStart(9, '0').slice(-9),
          firstNameEn: 'Sched',
          lastNameEn: 'Guard',
          identificationNo: `${SCHED_APPT_PATIENT_ID_PREFIX}${patientStamp}`,
          phone: '+66-2-555-9001',
          dateOfBirth: new Date('1990-01-15T00:00:00.000Z'),
          gender: 'FEMALE',
          emergencyPersonName: 'Kin',
          emergencyPersonRelation: 'Spouse',
          emergencyPersonPhone: '+66-2-555-9002',
          address: '789 Schedule Guard Road',
          createdBy: fixtures!.superAdminId,
        },
      });

      await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: fixtures!.doctorOwn.id,
          departmentId: fixtures!.deptOne.id,
          scheduleId: schedule.id,
          appointmentType: AppointmentType.CONSULTATION,
          status: AppointmentStatus.BOOKED,
          startAt: scheduleDate(26, 9, 30),
          endAt: scheduleDate(26, 10),
          createdBy: fixtures!.superAdminId,
        },
      });

      const jwt = await jwtFor(fixtures!.nurse);

      // PATCH → 409 SCHEDULE_HAS_APPOINTMENTS.
      const patch = await request(server)
        .patch(`/api/v1/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ acceptsBooking: false });

      expect(patch.status).toBe(409);
      expect(patch.body.code).toBe(ErrorCode.SCHEDULE_HAS_APPOINTMENTS);
      expect(patch.body.details).toEqual(
        expect.objectContaining({
          scheduleId: schedule.id,
          blockingAppointmentCount: 1,
        }),
      );

      // DELETE → also 409 SCHEDULE_HAS_APPOINTMENTS (same guard).
      const del = await request(server)
        .delete(`/api/v1/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${jwt}`);

      expect(del.status).toBe(409);
      expect(del.body.code).toBe(ErrorCode.SCHEDULE_HAS_APPOINTMENTS);
    },
  );

  maybe(
    'PATCH + DELETE succeed when the only referencing appointment is CANCELLED',
    async () => {
      // Same shape as above, but flip the appointment status to CANCELLED
      // so the guard SHOULD let both PATCH and DELETE through.
      const schedule = await prisma.doctorSchedule.create({
        data: {
          doctorId: fixtures!.doctorOwn.id,
          departmentId: fixtures!.deptOne.id,
          startAt: scheduleDate(27, 9),
          endAt: scheduleDate(27, 12),
          createdBy: fixtures!.nurse.user.id,
        },
      });

      const patientStamp = `${Date.now()}-c`;
      const patient = await prisma.patient.create({
        data: {
          hn: patientStamp.replace(/\D/g, '').padStart(9, '0').slice(-9),
          firstNameEn: 'Sched',
          lastNameEn: 'Cancelled',
          identificationNo: `${SCHED_APPT_PATIENT_ID_PREFIX}${patientStamp}`,
          phone: '+66-2-555-9101',
          dateOfBirth: new Date('1990-01-15T00:00:00.000Z'),
          gender: 'MALE',
          emergencyPersonName: 'Kin',
          emergencyPersonRelation: 'Spouse',
          emergencyPersonPhone: '+66-2-555-9102',
          address: '790 Schedule Guard Road',
          createdBy: fixtures!.superAdminId,
        },
      });

      await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: fixtures!.doctorOwn.id,
          departmentId: fixtures!.deptOne.id,
          scheduleId: schedule.id,
          appointmentType: AppointmentType.CONSULTATION,
          status: AppointmentStatus.CANCELLED,
          startAt: scheduleDate(27, 9, 30),
          endAt: scheduleDate(27, 10),
          createdBy: fixtures!.superAdminId,
        },
      });

      const jwt = await jwtFor(fixtures!.nurse);

      const patch = await request(server)
        .patch(`/api/v1/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ acceptsBooking: false });

      expect(patch.status).toBe(200);
      expect(patch.body.acceptsBooking).toBe(false);

      const del = await request(server)
        .delete(`/api/v1/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${jwt}`);

      expect(del.status).toBe(204);
    },
  );

  // ─── DTO validation ─────────────────────────────────────────────────────────

  maybe('DTO validation rejects endAt <= startAt (400 VALIDATION_FAILED)', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: scheduleIso(28, 12),
        endAt: scheduleIso(28, 9),
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  maybe('DTO validation rejects a break window outside the working window', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: scheduleIso(28, 9),
        endAt: scheduleIso(28, 12),
        breakStartAt: scheduleIso(28, 13),
        breakEndAt: scheduleIso(28, 14),
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  maybe('DTO validation rejects half-set break fields', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: scheduleIso(29, 9),
        endAt: scheduleIso(29, 12),
        breakStartAt: scheduleIso(29, 10),
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  // ─── pageSize=all sentinel ─────────────────────────────────────────────────

  maybe('STAFF list with pageSize=all returns the full filtered set in one response', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    // Seed three rows for doctorOwn across distinct days inside a fresh
    // future month so the assertion is independent of other suites' data.
    const allYear = 2098;
    const allMonth = 3; // March 2098
    const pad = (n: number): string => n.toString().padStart(2, '0');
    const allFrom = `${allYear}-${pad(allMonth)}-01`;
    const allTo = `${allYear}-${pad(allMonth)}-30`;
    const dayDate = (day: number, hour: number): Date =>
      new Date(
        `${allYear}-${pad(allMonth)}-${pad(day)}T${pad(hour)}:00:00.000Z`,
      );

    await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: dayDate(2, 9),
        endAt: dayDate(2, 12),
        createdBy: fixtures!.nurse.user.id,
      },
    });

    await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: dayDate(10, 9),
        endAt: dayDate(10, 12),
        createdBy: fixtures!.nurse.user.id,
      },
    });

    await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: dayDate(20, 9),
        endAt: dayDate(20, 12),
        createdBy: fixtures!.nurse.user.id,
      },
    });

    const res = await request(server)
      .get(
        `/api/v1/schedules?from=${allFrom}&to=${allTo}&doctorId=${fixtures!.doctorOwn.id}&pageSize=all`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(3);
    expect(res.body.totalPages).toBe(1);
  });

  maybe('list rejects pageSize=foo (arbitrary string) with 400', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get('/api/v1/schedules?pageSize=foo')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(400);
  });

  maybe('list rejects pageSize=0 with 400', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get('/api/v1/schedules?pageSize=0')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(400);
  });

  maybe('list rejects pageSize=999 (above MAX_PAGE_SIZE) with 400', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get('/api/v1/schedules?pageSize=999')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(400);
  });

  // ─── Past-startAt validation (SCHEDULE_START_IN_PAST) ──────────────────────

  maybe('STAFF cannot create a schedule whose startAt is in the past (400)', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayEnd = new Date(yesterday.getTime() + 3 * 60 * 60 * 1000);

    const res = await request(server)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: yesterday.toISOString(),
        endAt: yesterdayEnd.toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.SCHEDULE_START_IN_PAST);
    expect(res.body.details).toEqual(
      expect.objectContaining({
        startAt: yesterday.toISOString(),
      }),
    );
  });

  maybe('STAFF cannot PATCH a schedule whose merged startAt is in the past (400)', async () => {
    // Insert directly via Prisma so the row's startAt is already past —
    // bypasses the service-layer guard at write time, exercising the
    // "edit a row whose startAt has already passed" branch.
    const past = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pastEnd = new Date(past.getTime() + 3 * 60 * 60 * 1000);

    const row = await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtures!.doctorOwn.id,
        departmentId: fixtures!.deptOne.id,
        startAt: past,
        endAt: pastEnd,
        createdBy: fixtures!.nurse.user.id,
      },
    });

    const jwt = await jwtFor(fixtures!.nurse);
    const res = await request(server)
      .patch(`/api/v1/schedules/${row.id}`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ acceptsBooking: false });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.SCHEDULE_START_IN_PAST);
  });

  // ─── GET /doctors?departmentId= filter (Item 4 canonical replacement) ──────

  maybe('GET /doctors?departmentId= returns the doctor with their single department', async () => {
    // Post the Item-3 centralisation, Doctor carries exactly one
    // department (sourced from `User.departmentId`). The wire-side
    // `DoctorResponseDto` exposes a flat `{ departmentId, department }`
    // pair — no more `departments[].isPrimary` array.
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get(`/api/v1/doctors?departmentId=${fixtures!.deptOne.id}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const own = res.body.data.find(
      (d: { id: string }) => d.id === fixtures!.doctorOwn.id,
    );
    expect(own).toBeDefined();
    expect(own.departmentId).toBe(fixtures!.deptOne.id);
    expect(own.department).toEqual(
      expect.objectContaining({
        id: fixtures!.deptOne.id,
        name: DEPT_ONE_NAME,
      }),
    );
  });

  maybe('GET /doctors?departmentId= excludes doctors not in that department', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get(`/api/v1/doctors?departmentId=${fixtures!.deptOne.id}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(fixtures!.doctorOther.id);
  });

  // ─── GET /doctors?q= case-insensitive substring filter ─────────────────────

  maybe('GET /doctors?q=<firstNameEn> matches the scratch doctor', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get(`/api/v1/doctors?q=${encodeURIComponent(SEARCH_DOCTOR_FIRST_NAME_EN)}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(fixtures!.doctorOwn.id);
  });

  maybe('GET /doctors?q=<lowercase> matches case-insensitively', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get(
        `/api/v1/doctors?q=${encodeURIComponent(SEARCH_DOCTOR_FIRST_NAME_EN.toLowerCase())}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(fixtures!.doctorOwn.id);
  });

  maybe('GET /doctors?q=<thai-fragment> matches the Thai name field', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get(`/api/v1/doctors?q=${encodeURIComponent(SEARCH_DOCTOR_FIRST_NAME_TH)}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(fixtures!.doctorOwn.id);
  });

  maybe('GET /doctors?q=<code-prefix> matches by doctorCode', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get(`/api/v1/doctors?q=${encodeURIComponent(SEARCH_DOCTOR_CODE_PREFIX)}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(fixtures!.doctorOwn.id);
    // The scratch run only creates ONE doctorCode with this prefix, so the
    // filter should narrow to exactly that row.
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  maybe('GET /doctors?q= (empty) is treated as if omitted', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const baseline = await request(server)
      .get('/api/v1/doctors?pageSize=100')
      .set('Authorization', `Bearer ${jwt}`);
    const withEmpty = await request(server)
      .get('/api/v1/doctors?q=&pageSize=100')
      .set('Authorization', `Bearer ${jwt}`);

    expect(baseline.status).toBe(200);
    expect(withEmpty.status).toBe(200);
    expect(withEmpty.body.total).toBe(baseline.body.total);
  });

  maybe('GET /doctors?q=<whitespace> is treated as if omitted', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const baseline = await request(server)
      .get('/api/v1/doctors?pageSize=100')
      .set('Authorization', `Bearer ${jwt}`);
    const withWhitespace = await request(server)
      .get(`/api/v1/doctors?q=${encodeURIComponent('   ')}&pageSize=100`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(baseline.status).toBe(200);
    expect(withWhitespace.status).toBe(200);
    expect(withWhitespace.body.total).toBe(baseline.body.total);
  });

  maybe('GET /doctors?q=ZZZNOMATCH returns an empty page', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const res = await request(server)
      .get('/api/v1/doctors?q=ZZZNOMATCH')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.totalPages).toBe(1);
  });

  maybe('GET /doctors?q=<name>&departmentId= AND-combines both filters', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    // scratch doctorOwn is in deptOne, scratch doctorOther in deptTwo —
    // the unique name only exists on doctorOwn, so combining the same
    // name with deptTwo MUST return an empty set.
    const matching = await request(server)
      .get(
        `/api/v1/doctors?q=${encodeURIComponent(SEARCH_DOCTOR_FIRST_NAME_EN)}&departmentId=${fixtures!.deptOne.id}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(matching.status).toBe(200);
    const matchingIds = matching.body.data.map((d: { id: string }) => d.id);
    expect(matchingIds).toContain(fixtures!.doctorOwn.id);

    const nonMatching = await request(server)
      .get(
        `/api/v1/doctors?q=${encodeURIComponent(SEARCH_DOCTOR_FIRST_NAME_EN)}&departmentId=${fixtures!.deptTwo.id}`,
      )
      .set('Authorization', `Bearer ${jwt}`);

    expect(nonMatching.status).toBe(200);
    const nonMatchingIds = nonMatching.body.data.map((d: { id: string }) => d.id);
    expect(nonMatchingIds).not.toContain(fixtures!.doctorOwn.id);
  });

  maybe('GET /doctors?q=<too-long> rejects with 400', async () => {
    const jwt = await jwtFor(fixtures!.nurse);

    const tooLong = 'a'.repeat(101);
    const res = await request(server)
      .get(`/api/v1/doctors?q=${encodeURIComponent(tooLong)}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(400);
  });
});
