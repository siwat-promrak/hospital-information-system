/**
 * Integration coverage for the F21 DB CHECK constraint on
 * `department_appointment_type_windows`:
 *
 *   CHECK (start_minute >= 0
 *          AND start_minute < end_minute
 *          AND end_minute <= 1440)
 *
 * Mirrors matrix rows 16 (rejected — `start >= end`, negative start,
 * end > 1440) and 17 (boundary accept — `[0, 1440)`, `[0, 1)`,
 * `[1439, 1440)`).
 *
 * Boots a minimal Nest test module to obtain `PrismaService`. Skips
 * gracefully when the DB is unreachable so CI without Docker still
 * passes.
 */
import { Test } from '@nestjs/testing';
import { AppointmentType } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Wall-clock minute-of-day landmarks used to compose the boundary
// arguments below — extracting these makes the row 17 boundary table
// read like the spec ("first minute of day", "last minute of day", ...).
const FIRST_MINUTE_OF_DAY = 0;
const ONE_MINUTE_PAST_MIDNIGHT = 1;
const LAST_MINUTE_OF_DAY = 1439;
const END_OF_DAY = 1440;

// Distinctive bounds for the row 16 rejection cases — chosen so a
// failing assertion's payload makes the inversion obvious.
const INVERTED_START = 700;
const INVERTED_END = 600;
const EQUAL_BOUND = 660;
const NEGATIVE_START = -1;
const TOO_LARGE_END = END_OF_DAY + 1;

const SCRATCH_DEPT_NAME = 'F21 CHECK Constraint Dept';

interface Anchor {
  superAdminId: string;
  departmentAppointmentTypeId: string;
}

async function tryConnect(prisma: PrismaService): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return true;
  } catch {
    return false;
  }
}

async function teardown(prisma: PrismaService): Promise<void> {
  const departments = await prisma.department.findMany({
    where: { name: SCRATCH_DEPT_NAME },
    select: { id: true },
  });
  const departmentIds = departments.map((d) => d.id);

  if (departmentIds.length === 0) {
    return;
  }

  const dats = await prisma.departmentAppointmentType.findMany({
    where: { departmentId: { in: departmentIds } },
    select: { id: true },
  });

  await prisma.departmentAppointmentTypeWindow.deleteMany({
    where: { departmentAppointmentTypeId: { in: dats.map((d) => d.id) } },
  });

  await prisma.departmentAppointmentType.deleteMany({
    where: { departmentId: { in: departmentIds } },
  });

  await prisma.department.deleteMany({
    where: { id: { in: departmentIds } },
  });
}

async function setupAnchor(prisma: PrismaService): Promise<Anchor | null> {
  const superAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@gmail.com' },
  });

  if (!superAdmin) {
    return null;
  }

  await teardown(prisma);

  const dept = await prisma.department.create({
    data: {
      name: SCRATCH_DEPT_NAME,
      description: 'F21 CHECK constraint scratch dept',
      createdBy: superAdmin.id,
    },
  });

  const dat = await prisma.departmentAppointmentType.create({
    data: {
      departmentId: dept.id,
      appointmentType: AppointmentType.NEW_PATIENT_VISIT,
      durationMinutes: 30,
      createdBy: superAdmin.id,
    },
    select: { id: true },
  });

  return { superAdminId: superAdmin.id, departmentAppointmentTypeId: dat.id };
}

describe('F21 — department_appointment_type_windows CHECK constraint', () => {
  let prisma: PrismaService;
  let anchor: Anchor | null = null;
  let skipReason: string | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);

    const connected = await tryConnect(prisma);

    if (!connected) {
      skipReason = 'database is not reachable — skipping integration suite';

      return;
    }

    anchor = await setupAnchor(prisma);

    if (!anchor) {
      skipReason = 'super-admin seed missing — run pnpm db:seed';
    }
  });

  afterAll(async () => {
    if (anchor) {
      await teardown(prisma);
    }

    // PrismaService is a NestJS provider; closing it is via `$disconnect`.
    await prisma?.$disconnect?.();
  });

  const insertWindow = async (
    startMinute: number,
    endMinute: number,
  ): Promise<{ id: string }> =>
    prisma.departmentAppointmentTypeWindow.create({
      data: {
        departmentAppointmentTypeId: anchor!.departmentAppointmentTypeId,
        startMinute,
        endMinute,
        createdBy: anchor!.superAdminId,
      },
      select: { id: true },
    });

  // ─── Row 16: invalid bounds rejected by the CHECK ─────────────────────────

  const ROW_16_REJECTED: { label: string; start: number; end: number }[] = [
    { label: 'start == end (degenerate range)', start: EQUAL_BOUND, end: EQUAL_BOUND },
    { label: 'start > end (inverted)', start: INVERTED_START, end: INVERTED_END },
    { label: 'negative start', start: NEGATIVE_START, end: 100 },
    { label: 'end > 1440 (past midnight)', start: 0, end: TOO_LARGE_END },
  ];

  it.each(ROW_16_REJECTED)('row 16 — $label rejected by CHECK', async ({ start, end }) => {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.warn(`SKIP — ${skipReason}`);

      return;
    }

    await expect(insertWindow(start, end)).rejects.toThrow();
  });

  // ─── Row 17: boundary bounds accepted by the CHECK ────────────────────────

  const ROW_17_ACCEPTED: { label: string; start: number; end: number }[] = [
    { label: 'full day [0, 1440)', start: FIRST_MINUTE_OF_DAY, end: END_OF_DAY },
    { label: 'first minute only [0, 1)', start: FIRST_MINUTE_OF_DAY, end: ONE_MINUTE_PAST_MIDNIGHT },
    { label: 'last minute only [1439, 1440)', start: LAST_MINUTE_OF_DAY, end: END_OF_DAY },
  ];

  it.each(ROW_17_ACCEPTED)('row 17 — $label accepted', async ({ start, end }) => {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.warn(`SKIP — ${skipReason}`);

      return;
    }

    const created = await insertWindow(start, end);

    expect(created.id).toEqual(expect.any(String));

    // Clean up immediately so the next row test doesn't see this row
    // (and so teardown stays cheap).
    await prisma.departmentAppointmentTypeWindow.delete({ where: { id: created.id } });
  });
});
