/**
 * End-to-end mirror of the E21 booking-window test matrix
 * (`docs/user-stories.md` § "E21 — Multi-range booking windows").
 *
 * For each row of the slot-finder matrix that has a candidate slot, we
 * POST /appointments with the row's `(ranges, schedule, slot)` and assert
 * that the back-stop returns the same verdict the wizard does:
 *  - "included" rows → 201
 *  - "excluded" rows → 400 APPOINTMENT_OUTSIDE_BOOKING_WINDOW
 *
 * This proves the slot-finder filter (SlotsService) AND the create
 * back-stop (AppointmentsService.create) agree, because they share the
 * `isSlotWithinBookingWindows` predicate.
 *
 * Coverage (subset of rows 1–14 — see report for which rows were skipped):
 *  - Row 1   : no windows → 201 (unrestricted)
 *  - Row 2   : single range, slot ends == range end → 201
 *  - Row 3   : single range, slot starts == range end → 400
 *  - Row 4   : single range, slot straddles range end → 400
 *  - Row 5   : multi-range, slot inside range 1 → 201
 *  - Row 7   : multi-range, slot in midday gap → 400
 *  - Row 10  : split day-edge, midnight-crossing slot in after-15 range → 201
 *  - Row 11  : before-11 only, midnight-crossing slot → 400 (midnight-wrap regression)
 *  - Row 13  : after-15, cross-midnight schedule, slot 23:30–00:00 → 201
 *  - Row 14  : after-15, cross-midnight schedule, slot 00:00–00:30 next day → 400
 *
 * Tests run against the real Nest app + seeded Postgres but skip
 * gracefully when the DB is unreachable so CI without Docker still
 * passes.
 *
 * `CLINIC_TIMEZONE = Asia/Bangkok` (UTC+7). Local times are converted
 * via the helper below; matrix-row tables in the spec are wall-clock
 * local, fixtures store the equivalent UTC instants.
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

const NURSE_EMAIL = 'f21-matrix-nurse-e2e@gmail.com';
const DOCTOR_USER_EMAIL = 'f21-matrix-doctor-e2e@gmail.com';

// Each row gets its own dept so window configs don't collide.
const DEPT_NAME_PREFIX = 'F21 Matrix Dept';

const SCRATCH_PATIENT_ID_PREFIX = 'f21-matrix-pid-';

// Far-future scratch month so the past-startAt guard never fires.
const SCRATCH_YEAR = 2098;
const SCRATCH_MONTH = 3;

// Window-minute helpers — Asia/Bangkok wall-clock minute-of-day.
const MIN_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

// Bangkok offset relative to UTC. Used to translate local wall-clock
// to UTC `Date`s in fixtures and request payloads. Mirrors the
// `bkk(...)` helper in `clinic.spec.ts`.
const BANGKOK_OFFSET_HOURS = 7;

interface UserWithRole {
  user: User;
  roleCode: string;
}

interface Fixtures {
  nurse: UserWithRole;
  doctorUser: UserWithRole;
  doctor: Doctor;
  patient: Patient;
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

function deriveScratchHn(stamp: string): string {
  return stamp.padStart(9, '0').slice(-9);
}

/**
 * Build a UTC `Date` for the given scratch day at a Bangkok-local
 * wall-clock time. Local 23:30 → UTC 16:30 of the same calendar day;
 * local 00:00 → UTC 17:00 of the *previous* calendar day. The
 * `dayOffset` lets a caller ask for "next local day" without
 * recomputing the calendar.
 */
function bkkLocal(
  day: number,
  localHour: number,
  localMinute: number = 0,
  dayOffset: number = 0,
): Date {
  return dayjs
    .utc()
    .year(SCRATCH_YEAR)
    .month(SCRATCH_MONTH - 1)
    .date(day + dayOffset)
    .hour(localHour - BANGKOK_OFFSET_HOURS)
    .minute(localMinute)
    .second(0)
    .millisecond(0)
    .toDate();
}

async function teardownFixturesByNames(prisma: PrismaService): Promise<void> {
  const emails = [normalizeEmail(NURSE_EMAIL), normalizeEmail(DOCTOR_USER_EMAIL)];

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
    where: { name: { startsWith: DEPT_NAME_PREFIX } },
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

  const datIds = await prisma.departmentAppointmentType.findMany({
    where: { departmentId: { in: departmentIds } },
    select: { id: true },
  });

  await prisma.departmentAppointmentTypeWindow.deleteMany({
    where: { departmentAppointmentTypeId: { in: datIds.map((d) => d.id) } },
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

async function setupBaseFixtures(prisma: PrismaService): Promise<Fixtures | null> {
  const nurseRole = await prisma.role.findUnique({ where: { code: ROLE.NURSE } });
  const doctorRole = await prisma.role.findUnique({ where: { code: ROLE.DOCTOR } });
  const superAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@gmail.com' },
  });

  if (!nurseRole || !doctorRole || !superAdmin) {
    return null;
  }

  await teardownFixturesByNames(prisma);

  // Anchor department — every row's user/doctor/patient belong here;
  // per-row matrix departments are spun up inside `setupRowFixture`.
  // The nurse is anchored to a "matrix anchor" dept whose name starts
  // with `DEPT_NAME_PREFIX` so teardown sweeps it. Each per-row dept
  // shares the same prefix.
  const anchorDept = await prisma.department.create({
    data: {
      name: `${DEPT_NAME_PREFIX} Anchor`,
      description: 'F21 booking-window matrix — anchor dept',
      createdBy: superAdmin.id,
    },
  });

  const nurse: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(NURSE_EMAIL),
        firstNameEn: 'Matrix',
        lastNameEn: 'Nurse',
        roleId: nurseRole.id,
        // Nurse has no department so the scope check resolves to the
        // request's `departmentId` for every row.
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.NURSE,
  };

  const doctorUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_USER_EMAIL),
        firstNameEn: 'Matrix',
        lastNameEn: 'Doctor',
        roleId: doctorRole.id,
        // Doctor's home dept is the anchor; per-row schedules will live
        // in the per-row dept, so the per-row test re-homes the doctor
        // by updating the user.departmentId before the request.
        departmentId: anchorDept.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  const stamp = Date.now().toString(36).slice(-6);
  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.user.id,
      doctorCode: `F21M-${stamp}`,
      identificationNo: `f21m-${stamp}`,
      medicalLicenseNo: `MED-F21M-${stamp}`,
      phone: '+66-2-555-3001',
      createdBy: superAdmin.id,
    },
  });

  const patientStamp = Date.now().toString();
  const patient = await prisma.patient.create({
    data: {
      hn: deriveScratchHn(patientStamp),
      firstNameEn: 'Mali',
      lastNameEn: 'Charoen',
      identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${patientStamp}`,
      phone: '+66-2-555-3002',
      dateOfBirth: new Date('1992-04-10T00:00:00.000Z'),
      gender: 'FEMALE',
      emergencyPersonName: 'Som Charoen',
      emergencyPersonRelation: 'Spouse',
      emergencyPersonPhone: '+66-2-555-3003',
      address: '789 Example Road',
      createdBy: superAdmin.id,
    },
  });

  return { nurse, doctorUser, doctor, patient, superAdminId: superAdmin.id };
}

interface MatrixRow {
  num: number;
  label: string;
  windows: { startMinute: number; endMinute: number }[];
  scheduleStart: Date;
  scheduleEnd: Date;
  slotStart: Date;
  expected: 'included' | 'excluded';
}

/**
 * Matrix rows. Each row gets its own scratch `day` so schedule rows
 * never collide across tests.
 *
 * NOTE on minute-of-day literals: the local-time comments next to each
 * literal track the spec table. The values themselves ARE the test
 * data (CLAUDE.md §2b allows in-test literals when the literal is the
 * data point) — extracting them to named constants would obscure the
 * mapping from the spec row to the assertion.
 */
const MATRIX_ROWS: MatrixRow[] = [
  {
    num: 1,
    label: 'no windows → unrestricted',
    windows: [],
    scheduleStart: bkkLocal(1, 9), // 09:00 local
    scheduleEnd: bkkLocal(1, 12), // 12:00 local
    slotStart: bkkLocal(1, 9, 30), // 09:30 local (on the 30-min grid)
    expected: 'included',
  },
  {
    num: 2,
    label: '[09:00,11:00), slot 10:30–11:00 → included (ends == range end)',
    windows: [{ startMinute: 9 * MIN_PER_HOUR, endMinute: 11 * MIN_PER_HOUR }],
    scheduleStart: bkkLocal(2, 9),
    scheduleEnd: bkkLocal(2, 12),
    slotStart: bkkLocal(2, 10, 30),
    expected: 'included',
  },
  {
    num: 3,
    label: '[09:00,11:00), slot 11:00–11:30 → excluded (starts == range end)',
    windows: [{ startMinute: 9 * MIN_PER_HOUR, endMinute: 11 * MIN_PER_HOUR }],
    scheduleStart: bkkLocal(3, 9),
    scheduleEnd: bkkLocal(3, 12),
    slotStart: bkkLocal(3, 11),
    expected: 'excluded',
  },
  {
    num: 4,
    label: '[09:00,11:00), slot 10:45–11:15 → excluded (straddles range end)',
    windows: [{ startMinute: 9 * MIN_PER_HOUR, endMinute: 11 * MIN_PER_HOUR }],
    scheduleStart: bkkLocal(4, 9),
    scheduleEnd: bkkLocal(4, 12),
    // 10:45 is off-grid for a 30-min step anchored at 09:00, but the
    // window guard fires BEFORE the grid alignment check — so the
    // assertion still surfaces APPOINTMENT_OUTSIDE_BOOKING_WINDOW.
    slotStart: bkkLocal(4, 10, 45),
    expected: 'excluded',
  },
  {
    num: 5,
    label: '[09:00,11:00) ∪ [14:00,16:00), slot 09:30–10:00 → included (range 1)',
    windows: [
      { startMinute: 9 * MIN_PER_HOUR, endMinute: 11 * MIN_PER_HOUR },
      { startMinute: 14 * MIN_PER_HOUR, endMinute: 16 * MIN_PER_HOUR },
    ],
    scheduleStart: bkkLocal(5, 9),
    scheduleEnd: bkkLocal(5, 16),
    slotStart: bkkLocal(5, 9, 30),
    expected: 'included',
  },
  {
    num: 7,
    label: '[09:00,11:00) ∪ [14:00,16:00), slot 11:30–12:00 → excluded (midday gap)',
    windows: [
      { startMinute: 9 * MIN_PER_HOUR, endMinute: 11 * MIN_PER_HOUR },
      { startMinute: 14 * MIN_PER_HOUR, endMinute: 16 * MIN_PER_HOUR },
    ],
    scheduleStart: bkkLocal(7, 9),
    scheduleEnd: bkkLocal(7, 16),
    slotStart: bkkLocal(7, 11, 30),
    expected: 'excluded',
  },
  {
    num: 10,
    label: '[00:00,660) ∪ [900,1440), slot 23:30–00:00 → included (after-15)',
    windows: [
      { startMinute: 0, endMinute: 11 * MIN_PER_HOUR },
      { startMinute: 15 * MIN_PER_HOUR, endMinute: MINUTES_PER_DAY },
    ],
    // Schedule 16:00 local (day 10) → 00:00 local (day 11, == UTC 17:00 of day 10).
    scheduleStart: bkkLocal(10, 16),
    scheduleEnd: bkkLocal(11, 0),
    slotStart: bkkLocal(10, 23, 30),
    expected: 'included',
  },
  {
    num: 11,
    label: '[00:00,660) only, slot 23:30–00:00 → excluded (midnight-wrap regression)',
    windows: [{ startMinute: 0, endMinute: 11 * MIN_PER_HOUR }],
    scheduleStart: bkkLocal(12, 16),
    scheduleEnd: bkkLocal(13, 0),
    slotStart: bkkLocal(12, 23, 30),
    expected: 'excluded',
  },
  {
    num: 13,
    label: '[900,1440) after-15, cross-midnight schedule, slot 23:30–00:00 → included',
    windows: [{ startMinute: 15 * MIN_PER_HOUR, endMinute: MINUTES_PER_DAY }],
    scheduleStart: bkkLocal(14, 23),
    scheduleEnd: bkkLocal(15, 1),
    slotStart: bkkLocal(14, 23, 30),
    expected: 'included',
  },
  {
    num: 14,
    label: '[900,1440) after-15, cross-midnight schedule, slot 00:00–00:30 next day → excluded',
    windows: [{ startMinute: 15 * MIN_PER_HOUR, endMinute: MINUTES_PER_DAY }],
    scheduleStart: bkkLocal(16, 23),
    scheduleEnd: bkkLocal(17, 1),
    // 00:00 local of the NEXT day == UTC 17:00 of the schedule's UTC day.
    slotStart: bkkLocal(16, 0, 0, 1),
    expected: 'excluded',
  },
];

interface RowFixture {
  department: Department;
  schedule: DoctorSchedule;
}

async function setupRowFixture(
  prisma: PrismaService,
  base: Fixtures,
  row: MatrixRow,
): Promise<RowFixture> {
  const department = await prisma.department.create({
    data: {
      name: `${DEPT_NAME_PREFIX} Row ${row.num}`,
      description: `F21 matrix row ${row.num}`,
      createdBy: base.superAdminId,
    },
  });

  // Re-home both the doctor user (so DOCTOR_DEPARTMENT_MISMATCH passes)
  // AND the nurse (so the NURSE `.own-department` scope check passes —
  // the nurse must share the dept on the create request).
  await prisma.user.update({
    where: { id: base.doctorUser.user.id },
    data: { departmentId: department.id },
  });

  await prisma.user.update({
    where: { id: base.nurse.user.id },
    data: { departmentId: department.id },
  });

  // NEW_PATIENT_VISIT, 30-min duration. Standalone bookings MUST be
  // NEW_PATIENT_VISIT (STANDALONE_APPOINTMENT_TYPES); using it sidesteps
  // continuation-grouping plumbing.
  const dat = await prisma.departmentAppointmentType.create({
    data: {
      departmentId: department.id,
      appointmentType: AppointmentType.NEW_PATIENT_VISIT,
      durationMinutes: 30,
      createdBy: base.superAdminId,
    },
    select: { id: true },
  });

  if (row.windows.length > 0) {
    await prisma.departmentAppointmentTypeWindow.createMany({
      data: row.windows.map((w) => ({
        departmentAppointmentTypeId: dat.id,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
        createdBy: base.superAdminId,
      })),
    });
  }

  const schedule = await prisma.doctorSchedule.create({
    data: {
      doctorId: base.doctor.id,
      departmentId: department.id,
      startAt: row.scheduleStart,
      endAt: row.scheduleEnd,
      createdBy: base.superAdminId,
    },
  });

  return { department, schedule };
}

describe('F21 booking-window back-stop — matrix mirror', () => {
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

    fixtures = await setupBaseFixtures(prisma);

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

  const jwtFor = async (entry: UserWithRole): Promise<string> =>
    signTestJwt(
      { userId: entry.user.id, roleCode: entry.roleCode, email: entry.user.email },
      NEXTAUTH_SECRET,
    );

  it.each(MATRIX_ROWS)('row $num — $label', async (row) => {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.warn(`SKIP — ${skipReason}`);

      return;
    }

    const base = fixtures!;
    const rowFixture = await setupRowFixture(prisma, base, row);
    const jwt = await jwtFor(base.nurse);

    const res = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        patientId: base.patient.id,
        doctorId: base.doctor.id,
        departmentId: rowFixture.department.id,
        scheduleId: rowFixture.schedule.id,
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        startAt: row.slotStart.toISOString(),
      });

    if (row.expected === 'included') {
      expect(res.status).toBe(201);
      expect(res.body.startAt).toBe(row.slotStart.toISOString());
    } else {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.APPOINTMENT_OUTSIDE_BOOKING_WINDOW);
    }
  });
});
