/**
 * End-to-end coverage for F02 auth core. Exercises the real Nest app against
 * the seeded Postgres database — the suite is skipped automatically when the
 * DB is unreachable (so CI / local dev without Docker still passes).
 *
 * What is covered:
 *  - POST /auth/resolve happy path for ADMIN, STAFF, DOCTOR.
 *  - POST /auth/resolve error paths (missing internal secret, NOT_INVITED,
 *    USER_DISABLED, EMAIL_UNVERIFIED).
 *  - GET /me — missing / invalid JWT rejected; valid JWT returns the user.
 *  - GET /me/permissions-check — ADMIN passes, STAFF receives 403
 *    `INSUFFICIENT_PERMISSION` with `{ required, held }`.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { AUTH_LOG_EVENT } from '../src/auth-log/auth-log.const';
import { INTERNAL_SECRET_HEADER } from '../src/auth/auth.const';
import { PERMISSION } from '../src/auth/permissions';
import { DEFAULT_ROLE_PERMISSIONS, ROLE } from '../src/auth/roles';
import { AppModule } from '../src/app.module';
import { ErrorCode } from '../src/common/errors';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { normalizeEmail } from '../src/common/normalize-email';
import { PrismaService } from '../src/prisma/prisma.service';

import { signTestJwt } from './utils/sign-jwt';

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? 'dev-internal-api-secret-change-me';
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'dev-nextauth-secret-change-me';

const DOCTOR_EMAIL = 'doctor-e2e@gmail.com';
const DISABLED_EMAIL = 'nurse-disabled-e2e@gmail.com';

interface SeededIds {
  adminId: string;
  adminEmail: string;
  nurseId: string;
  nurseEmail: string;
  doctorId: string;
  disabledId: string;
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

async function ensureFixtures(prisma: PrismaService): Promise<SeededIds | null> {
  const admin = await prisma.user.findFirst({
    where: { email: 'admin1@gmail.com', deletedAt: null },
    include: { role: true },
  });
  const nurse = await prisma.user.findFirst({
    where: { email: 'nurse1@gmail.com', deletedAt: null },
    include: { role: true },
  });
  const adminRole = await prisma.role.findUnique({ where: { code: ROLE.ADMIN } });
  const doctorRole = await prisma.role.findUnique({ where: { code: ROLE.DOCTOR } });
  const nurseRole = await prisma.role.findUnique({ where: { code: ROLE.NURSE } });

  if (!admin || !nurse || !adminRole || !doctorRole || !nurseRole) {
    return null;
  }

  // Doctor seed users carry `User.departmentId` (scoped role); reuse the
  // nurse's department so the FK constraint holds without seeding another
  // department row here.
  const doctor = await prisma.user.upsert({
    where: { email: normalizeEmail(DOCTOR_EMAIL) },
    update: {
      firstNameEn: 'Doctor',
      lastNameEn: 'E2E',
      roleId: doctorRole.id,
      departmentId: nurse.departmentId,
      deletedAt: null,
      deletedBy: null,
    },
    create: {
      email: normalizeEmail(DOCTOR_EMAIL),
      firstNameEn: 'Doctor',
      lastNameEn: 'E2E',
      roleId: doctorRole.id,
      departmentId: nurse.departmentId,
      createdBy: admin.id,
    },
  });

  const disabled = await prisma.user.upsert({
    where: { email: normalizeEmail(DISABLED_EMAIL) },
    update: {
      firstNameEn: 'Disabled',
      lastNameEn: 'E2E',
      roleId: nurseRole.id,
      departmentId: nurse.departmentId,
      deletedAt: new Date(),
      deletedBy: admin.id,
    },
    create: {
      email: normalizeEmail(DISABLED_EMAIL),
      firstNameEn: 'Disabled',
      lastNameEn: 'E2E',
      roleId: nurseRole.id,
      departmentId: nurse.departmentId,
      createdBy: admin.id,
      deletedAt: new Date(),
      deletedBy: admin.id,
    },
  });

  return {
    adminId: admin.id,
    adminEmail: admin.email,
    nurseId: nurse.id,
    nurseEmail: nurse.email,
    doctorId: doctor.id,
    disabledId: disabled.id,
  };
}

async function teardownFixtures(prisma: PrismaService, ids: SeededIds): Promise<void> {
  // Auth-log rows hold FKs to the test users — delete them first so the
  // user.deleteMany below isn't blocked by ON DELETE NO ACTION.
  await prisma.authLog.deleteMany({
    where: {
      OR: [
        { userId: { in: [ids.adminId, ids.nurseId, ids.doctorId, ids.disabledId] } },
        { email: { in: [DOCTOR_EMAIL, DISABLED_EMAIL, 'stranger@gmail.com'] } },
      ],
    },
  });

  await prisma.user.deleteMany({
    where: { id: { in: [ids.doctorId, ids.disabledId] } },
  });
}

describe('F02 — Auth core e2e', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ids: SeededIds | null = null;
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

    ids = await ensureFixtures(prisma);

    if (!ids) {
      skipReason = 'seeded ADMIN / NURSE / role rows are missing — run pnpm db:seed';
    }
  });

  afterAll(async () => {
    if (ids) {
      await teardownFixtures(prisma, ids);
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

  // ─── POST /auth/resolve ────────────────────────────────────────────────────

  maybe('rejects resolve calls missing the internal secret', async () => {
    const res = await request(server)
      .post('/api/v1/auth/resolve')
      .send({
        email: ids!.adminEmail,
        googleSub: 'g-1',
        emailVerified: true,
        name: 'Sarah Smith',
      });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: ErrorCode.AUTH_INTERNAL_FORBIDDEN });
  });

  maybe('resolves an ADMIN user with the 5-permission set', async () => {
    const res = await request(server)
      .post('/api/v1/auth/resolve')
      .set(INTERNAL_SECRET_HEADER, INTERNAL_SECRET)
      .send({
        email: ids!.adminEmail,
        googleSub: 'g-admin-1',
        emailVerified: true,
        name: 'Sarah Smith',
      });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(ids!.adminId);
    expect(res.body.roleCode).toBe(ROLE.ADMIN);
    expect(new Set(res.body.permissionCodes)).toEqual(
      new Set(DEFAULT_ROLE_PERMISSIONS[ROLE.ADMIN]),
    );
    // Org-wide role — no home department.
    expect(res.body.departmentId).toBeNull();
  });

  maybe('resolves a NURSE user with the 11-permission set', async () => {
    const res = await request(server)
      .post('/api/v1/auth/resolve')
      .set(INTERNAL_SECRET_HEADER, INTERNAL_SECRET)
      .send({
        email: ids!.nurseEmail,
        googleSub: 'g-nurse-1',
        emailVerified: true,
        name: 'Pim Sukjai',
      });

    expect(res.status).toBe(200);
    expect(res.body.roleCode).toBe(ROLE.NURSE);
    expect(res.body.permissionCodes).toHaveLength(
      DEFAULT_ROLE_PERMISSIONS[ROLE.NURSE].length,
    );
    expect(res.body.permissionCodes).toEqual(
      expect.arrayContaining([
        PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
        PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
        PERMISSION.PATIENT_CREATE,
        PERMISSION.DOCTOR_READ,
      ]),
    );
    // Department-scoped role — `departmentId` MUST round-trip so the FE
    // can scope list filters (e.g. /schedules doctor picker) to the
    // caller's home dept without a /me round-trip.
    expect(typeof res.body.departmentId).toBe('string');
    expect(res.body.departmentId.length).toBeGreaterThan(0);
  });

  maybe('resolves a DOCTOR user with the full DOCTOR permission set', async () => {
    const res = await request(server)
      .post('/api/v1/auth/resolve')
      .set(INTERNAL_SECRET_HEADER, INTERNAL_SECRET)
      .send({
        email: DOCTOR_EMAIL,
        googleSub: 'g-doctor-1',
        emailVerified: true,
        name: 'Doctor E2E',
      });

    expect(res.status).toBe(200);
    expect(res.body.roleCode).toBe(ROLE.DOCTOR);
    expect(res.body.permissionCodes).toEqual(
      expect.arrayContaining([
        PERMISSION.SCHEDULE_CREATE_OWN,
        PERMISSION.SCHEDULE_READ_OWN,
        PERMISSION.APPOINTMENT_CREATE_OWN,
        PERMISSION.DOCTOR_WORKSPACE_READ_OWN,
        PERMISSION.PATIENT_READ,
      ]),
    );
    // Same dept-scoped contract as NURSE.
    expect(typeof res.body.departmentId).toBe('string');
    expect(res.body.departmentId.length).toBeGreaterThan(0);
  });

  maybe('rejects unverified Google emails with EMAIL_UNVERIFIED', async () => {
    const res = await request(server)
      .post('/api/v1/auth/resolve')
      .set(INTERNAL_SECRET_HEADER, INTERNAL_SECRET)
      .send({
        email: ids!.adminEmail,
        googleSub: 'g-x',
        emailVerified: false,
        name: 'Sarah Smith',
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(ErrorCode.EMAIL_UNVERIFIED);
  });

  maybe('rejects unknown emails with NOT_INVITED', async () => {
    const res = await request(server)
      .post('/api/v1/auth/resolve')
      .set(INTERNAL_SECRET_HEADER, INTERNAL_SECRET)
      .send({
        email: 'stranger@gmail.com',
        googleSub: 'g-x',
        emailVerified: true,
        name: 'Stranger',
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(ErrorCode.NOT_INVITED);
  });

  maybe('rejects disabled emails with USER_DISABLED', async () => {
    const res = await request(server)
      .post('/api/v1/auth/resolve')
      .set(INTERNAL_SECRET_HEADER, INTERNAL_SECRET)
      .send({
        email: DISABLED_EMAIL,
        googleSub: 'g-x',
        emailVerified: true,
        name: 'Disabled E2E',
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(ErrorCode.USER_DISABLED);
  });

  // ─── GET /me ───────────────────────────────────────────────────────────────

  maybe('rejects GET /me without a session cookie', async () => {
    const res = await request(server).get('/api/v1/me');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(ErrorCode.AUTH_MISSING_TOKEN);
  });

  maybe('rejects GET /me with a tampered JWT', async () => {
    const res = await request(server)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer this.is.not.a.real.jwt');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(ErrorCode.AUTH_INVALID_TOKEN);
  });

  maybe('returns the user payload on GET /me with a valid JWT', async () => {
    const jwt = await signTestJwt(
      { userId: ids!.nurseId, roleCode: ROLE.NURSE, email: ids!.nurseEmail },
      NEXTAUTH_SECRET,
    );

    const res = await request(server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ids!.nurseId);
    expect(res.body.roleCode).toBe(ROLE.NURSE);
    expect(Array.isArray(res.body.permissionCodes)).toBe(true);
  });

  // ─── permission gate ───────────────────────────────────────────────────────

  maybe('ADMIN can call the permission.assign-gated stub', async () => {
    const jwt = await signTestJwt(
      { userId: ids!.adminId, roleCode: ROLE.ADMIN, email: ids!.adminEmail },
      NEXTAUTH_SECRET,
    );

    const res = await request(server)
      .get('/api/v1/me/permissions-check')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  maybe('NURSE receives 403 INSUFFICIENT_PERMISSION on the stub', async () => {
    const jwt = await signTestJwt(
      { userId: ids!.nurseId, roleCode: ROLE.NURSE, email: ids!.nurseEmail },
      NEXTAUTH_SECRET,
    );

    const res = await request(server)
      .get('/api/v1/me/permissions-check')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION);
    expect(res.body.details.required).toEqual([PERMISSION.ROLE_UPDATE]);
    expect(res.body.details.held).not.toContain(PERMISSION.ROLE_UPDATE);
  });

  // ─── auth_logs ─────────────────────────────────────────────────────────────
  // Each test below issues a request and then reads back the most recent
  // matching `auth_logs` row to verify the write happened. The auth-log
  // writes are `await`-ed inside AuthService / PermissionsGuard so the row
  // is guaranteed to exist by the time the response returns.

  maybe('SIGN_IN_SUCCESS row is written on a successful resolve', async () => {
    const before = new Date();

    await request(server)
      .post('/api/v1/auth/resolve')
      .set(INTERNAL_SECRET_HEADER, INTERNAL_SECRET)
      .set('User-Agent', 'jest-supertest/e2e')
      .send({
        email: ids!.nurseEmail,
        googleSub: 'g-log-staff',
        emailVerified: true,
        name: 'Pim Sukjai',
      })
      .expect(200);

    const row = await prisma.authLog.findFirst({
      where: {
        event: AUTH_LOG_EVENT.SIGN_IN_SUCCESS,
        userId: ids!.nurseId,
        createdAt: { gte: before },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(row).not.toBeNull();
    expect(row!.email).toBe(ids!.nurseEmail);
    expect(row!.reason).toBeNull();
    expect(row!.requiredPermissions).toEqual([]);
    expect(row!.heldPermissions).toEqual([]);
    expect(row!.userAgent).toBe('jest-supertest/e2e');
    expect(row!.method).toBe('POST');
    expect(row!.path).toContain('/auth/resolve');
  });

  maybe('SIGN_IN_FAILED row carries the reason code for NOT_INVITED', async () => {
    const before = new Date();
    const email = 'stranger@gmail.com';

    await request(server)
      .post('/api/v1/auth/resolve')
      .set(INTERNAL_SECRET_HEADER, INTERNAL_SECRET)
      .send({ email, googleSub: 'g-x', emailVerified: true, name: 'Stranger' })
      .expect(401);

    const row = await prisma.authLog.findFirst({
      where: {
        event: AUTH_LOG_EVENT.SIGN_IN_FAILED,
        email,
        createdAt: { gte: before },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(row).not.toBeNull();
    expect(row!.userId).toBeNull();
    expect(row!.reason).toBe(ErrorCode.NOT_INVITED);
  });

  maybe('SIGN_IN_FAILED row uses USER_DISABLED for soft-deleted accounts', async () => {
    const before = new Date();

    await request(server)
      .post('/api/v1/auth/resolve')
      .set(INTERNAL_SECRET_HEADER, INTERNAL_SECRET)
      .send({
        email: DISABLED_EMAIL,
        googleSub: 'g-x',
        emailVerified: true,
        name: 'Disabled E2E',
      })
      .expect(401);

    const row = await prisma.authLog.findFirst({
      where: {
        event: AUTH_LOG_EVENT.SIGN_IN_FAILED,
        email: DISABLED_EMAIL,
        createdAt: { gte: before },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(row).not.toBeNull();
    expect(row!.reason).toBe(ErrorCode.USER_DISABLED);
  });

  maybe('PERMISSION_DENIED row captures required + held when NURSE hits an ADMIN-only route', async () => {
    const before = new Date();
    const jwt = await signTestJwt(
      { userId: ids!.nurseId, roleCode: ROLE.NURSE, email: ids!.nurseEmail },
      NEXTAUTH_SECRET,
    );

    await request(server)
      .get('/api/v1/me/permissions-check')
      .set('Authorization', `Bearer ${jwt}`)
      .expect(403);

    const row = await prisma.authLog.findFirst({
      where: {
        event: AUTH_LOG_EVENT.PERMISSION_DENIED,
        userId: ids!.nurseId,
        createdAt: { gte: before },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(row).not.toBeNull();
    expect(row!.requiredPermissions).toEqual([PERMISSION.ROLE_UPDATE]);
    expect(row!.heldPermissions).toEqual(
      expect.arrayContaining([
        PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
        PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
      ]),
    );
    expect(row!.heldPermissions).not.toContain(PERMISSION.ROLE_UPDATE);
    expect(row!.path).toContain('/me/permissions-check');
    expect(row!.method).toBe('GET');
  });

  maybe('SIGN_OUT writes a row and clears no cookie on the BE side', async () => {
    const before = new Date();
    const jwt = await signTestJwt(
      { userId: ids!.adminId, roleCode: ROLE.ADMIN, email: ids!.adminEmail },
      NEXTAUTH_SECRET,
    );

    await request(server)
      .post('/api/v1/auth/signout')
      .set('Authorization', `Bearer ${jwt}`)
      .expect(204);

    const row = await prisma.authLog.findFirst({
      where: {
        event: AUTH_LOG_EVENT.SIGN_OUT,
        userId: ids!.adminId,
        createdAt: { gte: before },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(row).not.toBeNull();
    expect(row!.email).toBe(ids!.adminEmail);
  });
});
