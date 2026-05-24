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
const DISABLED_EMAIL = 'staff-disabled-e2e@gmail.com';

interface SeededIds {
  adminId: string;
  adminEmail: string;
  staffId: string;
  staffEmail: string;
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
  const staff = await prisma.user.findFirst({
    where: { email: 'staff1@gmail.com', deletedAt: null },
    include: { role: true },
  });
  const adminRole = await prisma.role.findUnique({ where: { code: ROLE.ADMIN } });
  const doctorRole = await prisma.role.findUnique({ where: { code: ROLE.DOCTOR } });
  const staffRole = await prisma.role.findUnique({ where: { code: ROLE.STAFF } });

  if (!admin || !staff || !adminRole || !doctorRole || !staffRole) {
    return null;
  }

  const doctor = await prisma.user.upsert({
    where: { email: normalizeEmail(DOCTOR_EMAIL) },
    update: {
      firstNameEn: 'Doctor',
      lastNameEn: 'E2E',
      roleId: doctorRole.id,
      deletedAt: null,
      deletedBy: null,
    },
    create: {
      email: normalizeEmail(DOCTOR_EMAIL),
      firstNameEn: 'Doctor',
      lastNameEn: 'E2E',
      roleId: doctorRole.id,
      createdBy: admin.id,
    },
  });

  const disabled = await prisma.user.upsert({
    where: { email: normalizeEmail(DISABLED_EMAIL) },
    update: {
      firstNameEn: 'Disabled',
      lastNameEn: 'E2E',
      roleId: staffRole.id,
      deletedAt: new Date(),
      deletedBy: admin.id,
    },
    create: {
      email: normalizeEmail(DISABLED_EMAIL),
      firstNameEn: 'Disabled',
      lastNameEn: 'E2E',
      roleId: staffRole.id,
      createdBy: admin.id,
      deletedAt: new Date(),
      deletedBy: admin.id,
    },
  });

  return {
    adminId: admin.id,
    adminEmail: admin.email,
    staffId: staff.id,
    staffEmail: staff.email,
    doctorId: doctor.id,
    disabledId: disabled.id,
  };
}

async function teardownFixtures(prisma: PrismaService, ids: SeededIds): Promise<void> {
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
      skipReason = 'seeded ADMIN / STAFF / role rows are missing — run pnpm db:seed';
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
  });

  maybe('resolves a STAFF user with the 11-permission set', async () => {
    const res = await request(server)
      .post('/api/v1/auth/resolve')
      .set(INTERNAL_SECRET_HEADER, INTERNAL_SECRET)
      .send({
        email: ids!.staffEmail,
        googleSub: 'g-staff-1',
        emailVerified: true,
        name: 'Pim Sukjai',
      });

    expect(res.status).toBe(200);
    expect(res.body.roleCode).toBe(ROLE.STAFF);
    expect(res.body.permissionCodes).toHaveLength(
      DEFAULT_ROLE_PERMISSIONS[ROLE.STAFF].length,
    );
    expect(res.body.permissionCodes).toEqual(
      expect.arrayContaining([
        PERMISSION.APPOINTMENT_CREATE,
        PERMISSION.SCHEDULE_MANAGE,
        PERMISSION.PATIENT_CREATE,
        PERMISSION.DOCTOR_LIST,
      ]),
    );
  });

  maybe('resolves a DOCTOR user with only schedule.manage', async () => {
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
    expect(res.body.permissionCodes).toEqual([PERMISSION.SCHEDULE_MANAGE]);
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
      { userId: ids!.staffId, roleCode: ROLE.STAFF, email: ids!.staffEmail },
      NEXTAUTH_SECRET,
    );

    const res = await request(server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ids!.staffId);
    expect(res.body.roleCode).toBe(ROLE.STAFF);
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

  maybe('STAFF receives 403 INSUFFICIENT_PERMISSION on the stub', async () => {
    const jwt = await signTestJwt(
      { userId: ids!.staffId, roleCode: ROLE.STAFF, email: ids!.staffEmail },
      NEXTAUTH_SECRET,
    );

    const res = await request(server)
      .get('/api/v1/me/permissions-check')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION);
    expect(res.body.details.required).toEqual([PERMISSION.PERMISSION_ASSIGN]);
    expect(res.body.details.held).not.toContain(PERMISSION.PERMISSION_ASSIGN);
  });
});
