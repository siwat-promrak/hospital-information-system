/**
 * End-to-end coverage for F09 — `/patients` BE module.
 *
 * Mirrors the F06 / F07 / F08 suite shape: tests run against the real
 * Nest app + seeded Postgres, but the whole suite skips gracefully when
 * the DB is unreachable so CI without Docker still passes.
 *
 * What is covered:
 *  - POST /patients
 *    - NURSE creates walk-in patient → 201, `hn` matches the
 *      `^[0-9]{7,9}$` regex.
 *    - Duplicate email → 409 PATIENT_EMAIL_EXISTS.
 *    - No JWT → 401.
 *    - DOCTOR (no `patient.create`) → 403 INSUFFICIENT_PERMISSION.
 *  - GET /patients
 *    - Search by partial name returns the row.
 *    - Search by partial HN returns the row.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { User } from '@prisma/client';
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

const NURSE_EMAIL = 'patients-nurse-e2e@gmail.com';
const DOCTOR_USER_EMAIL = 'patients-doctor-e2e@gmail.com';

const DEPT_NAME = 'Patients E2E Dept';

/**
 * Scratch patient identifier prefix — used so teardown can match by
 * `identificationNo` substring even after a unique-email collision on
 * an aborted run.
 */
const SCRATCH_PATIENT_ID_PREFIX = 'patients-e2e-pid-';
const SCRATCH_PATIENT_EMAIL = `patients-walk-${Date.now().toString(36).slice(-6)}@example.com`;

interface UserWithRole {
  user: User;
  roleCode: string;
}

interface Fixtures {
  nurse: UserWithRole;
  doctorUser: UserWithRole;
  superAdminId: string;
  scratchUniqueSuffix: string;
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
  const superAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@gmail.com' },
  });

  if (!nurseRole || !doctorRole || !superAdmin) {
    return null;
  }

  await teardownFixturesByNames(prisma);

  const dept = await prisma.department.create({
    data: {
      name: DEPT_NAME,
      description: 'F09 patients e2e scratch department',
      createdBy: superAdmin.id,
    },
  });

  const nurse: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(NURSE_EMAIL),
        firstNameEn: 'Patients',
        lastNameEn: 'Nurse',
        roleId: nurseRole.id,
        departmentId: dept.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.NURSE,
  };

  const doctorUser: UserWithRole = {
    user: await prisma.user.create({
      data: {
        email: normalizeEmail(DOCTOR_USER_EMAIL),
        firstNameEn: 'Patients',
        lastNameEn: 'Doctor',
        roleId: doctorRole.id,
        departmentId: dept.id,
        createdBy: superAdmin.id,
      },
    }),
    roleCode: ROLE.DOCTOR,
  };

  return {
    nurse,
    doctorUser,
    superAdminId: superAdmin.id,
    scratchUniqueSuffix: Date.now().toString(36).slice(-6),
  };
}

async function teardownFixturesByNames(prisma: PrismaService): Promise<void> {
  const emails = [normalizeEmail(NURSE_EMAIL), normalizeEmail(DOCTOR_USER_EMAIL)];

  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const departments = await prisma.department.findMany({
    where: { name: DEPT_NAME },
    select: { id: true },
  });
  const departmentIds = departments.map((d) => d.id);

  await prisma.patient.deleteMany({
    where: {
      OR: [
        { identificationNo: { startsWith: SCRATCH_PATIENT_ID_PREFIX } },
        { email: SCRATCH_PATIENT_EMAIL },
      ],
    },
  });

  await prisma.authLog.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { email: { in: emails } }],
    },
  });

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
}

describe('F09 — patients e2e', () => {
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

  function walkInPayload(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    const stamp = fixtures!.scratchUniqueSuffix;

    return {
      firstNameEn: 'Praewa',
      lastNameEn: 'Boonmee',
      dateOfBirth: '1990-01-15',
      gender: 'FEMALE',
      identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${stamp}-base`,
      phone: '+66-2-555-1234',
      emergencyPersonName: 'Anan Boonmee',
      emergencyPersonRelation: 'Spouse',
      emergencyPersonPhone: '+66-2-555-9999',
      address: '123 Example Road',
      ...overrides,
    };
  }

  // ─── POST /patients ────────────────────────────────────────────────────────

  describe('POST /patients', () => {
    maybe('NURSE creates a walk-in patient → 201, hn matches the regex', async () => {
      const jwt = await jwtFor(fixtures!.nurse);

      const res = await request(server)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${jwt}`)
        .send(
          walkInPayload({
            email: SCRATCH_PATIENT_EMAIL,
            identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${fixtures!.scratchUniqueSuffix}-walk`,
          }),
        );

      expect(res.status).toBe(201);
      expect(typeof res.body.id).toBe('string');
      expect(res.body.firstNameEn).toBe('Praewa');
      expect(res.body.lastNameEn).toBe('Boonmee');
      expect(res.body.email).toBe(SCRATCH_PATIENT_EMAIL);
      expect(res.body.bloodGroup).toBe('UNKNOWN');
      expect(res.body.dateOfBirth).toBe('1990-01-15');
      expect(res.body.hn).toMatch(/^[0-9]{7,9}$/);
    });

    maybe('Duplicate email → 409 PATIENT_EMAIL_EXISTS', async () => {
      // The happy-path test above created a row with SCRATCH_PATIENT_EMAIL.
      // Submitting again with the same email must trip the dup guard.
      const jwt = await jwtFor(fixtures!.nurse);

      const res = await request(server)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${jwt}`)
        .send(
          walkInPayload({
            email: SCRATCH_PATIENT_EMAIL,
            identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${fixtures!.scratchUniqueSuffix}-dup`,
          }),
        );

      expect(res.status).toBe(409);
      expect(res.body.code).toBe(ErrorCode.PATIENT_EMAIL_EXISTS);
    });

    maybe('No JWT → 401', async () => {
      const res = await request(server)
        .post('/api/v1/patients')
        .send(walkInPayload());

      expect(res.status).toBe(401);
    });

    maybe('DOCTOR (no patient.create) → 403 INSUFFICIENT_PERMISSION', async () => {
      const jwt = await jwtFor(fixtures!.doctorUser);

      const res = await request(server)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${jwt}`)
        .send(
          walkInPayload({
            identificationNo: `${SCRATCH_PATIENT_ID_PREFIX}${fixtures!.scratchUniqueSuffix}-forbid`,
          }),
        );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION);
    });
  });

  // ─── GET /patients ─────────────────────────────────────────────────────────

  describe('GET /patients', () => {
    maybe('search by partial name returns matching rows', async () => {
      const jwt = await jwtFor(fixtures!.nurse);

      const res = await request(server)
        .get('/api/v1/patients?q=praewa&pageSize=50')
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);

      const names = res.body.data.map(
        (p: { firstNameEn: string }) => p.firstNameEn.toLowerCase(),
      );
      expect(names.some((n: string) => n.includes('praewa'))).toBe(true);
    });

    maybe('search by partial HN returns the row', async () => {
      const jwt = await jwtFor(fixtures!.nurse);

      // Fetch the happy-path patient and search by its HN substring.
      const all = await request(server)
        .get('/api/v1/patients?q=praewa&pageSize=50')
        .set('Authorization', `Bearer ${jwt}`);
      const target = all.body.data.find(
        (p: { email: string }) => p.email === SCRATCH_PATIENT_EMAIL,
      );

      if (!target) {
        // Happy-path test failed earlier — bail out cleanly so the FE
        // dependency is the one surfaced.
        throw new Error('walk-in fixture missing — fix the happy-path test first');
      }

      const partial = target.hn.slice(-6);
      const res = await request(server)
        .get(`/api/v1/patients?q=${partial}&pageSize=50`)
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      const hns = res.body.data.map((p: { hn: string }) => p.hn);
      expect(hns).toContain(target.hn);
    });
  });
});
