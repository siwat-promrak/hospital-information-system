/**
 * Seeds dated `DoctorSchedule` rows for every seeded doctor across the
 * past 8 + next 4 weeks (starting Monday of the current week). Each
 * doctor follows a deterministic 3-day-per-week template, so re-running
 * the seed against the same week reproduces the same windows.
 *
 * Idempotency: schedules have no natural key, so we wipe all schedules
 * for the seeded doctors first, then re-insert. This is safe because no
 * other seeder touches `DoctorSchedule`.
 *
 * Volume: 75 doctors × 3 weekdays × 12 weeks = 2700 schedules.
 *
 * Doctors with two or more departments rotate the week's schedule
 * through every affiliation (`weekIdx % affiliations.length`) so the
 * booking flow has multi-department coverage even for 3-dept doctors.
 *
 * Depends on doctors.ts (and therefore departments.ts).
 */
import { PrismaClient, type Doctor, type DoctorDepartment, type User } from '@prisma/client';

interface ScheduleTemplate {
  // 0 = Monday, 1 = Tuesday, ..., 6 = Sunday (ISO-style indexing inside the seeder)
  dayOffset: number;
  startHour: number;
  endHour: number;
  breakStartHour: number | null;
  breakEndHour: number | null;
}

const WEEKDAY_PATTERNS: ScheduleTemplate[][] = [
  // Pattern 0 — Mon morning / Wed afternoon / Fri full-day with lunch
  [
    { dayOffset: 0, startHour: 9, endHour: 12, breakStartHour: null, breakEndHour: null },
    { dayOffset: 2, startHour: 13, endHour: 17, breakStartHour: null, breakEndHour: null },
    { dayOffset: 4, startHour: 9, endHour: 17, breakStartHour: 12, breakEndHour: 13 },
  ],
  // Pattern 1 — Tue early shift / Thu late + tea break / Fri afternoon
  [
    { dayOffset: 1, startHour: 8, endHour: 12, breakStartHour: null, breakEndHour: null },
    { dayOffset: 3, startHour: 13, endHour: 18, breakStartHour: 15, breakEndHour: 16 },
    { dayOffset: 4, startHour: 14, endHour: 17, breakStartHour: null, breakEndHour: null },
  ],
  // Pattern 2 — Mon afternoon / Tue full-day with lunch / Thu morning
  [
    { dayOffset: 0, startHour: 13, endHour: 17, breakStartHour: null, breakEndHour: null },
    { dayOffset: 1, startHour: 9, endHour: 16, breakStartHour: 12, breakEndHour: 13 },
    { dayOffset: 3, startHour: 9, endHour: 12, breakStartHour: null, breakEndHour: null },
  ],
  // Pattern 3 — Wed full / Fri morning / Sat morning (weekend coverage)
  [
    { dayOffset: 2, startHour: 9, endHour: 18, breakStartHour: 12, breakEndHour: 13 },
    { dayOffset: 4, startHour: 9, endHour: 12, breakStartHour: null, breakEndHour: null },
    { dayOffset: 5, startHour: 9, endHour: 13, breakStartHour: null, breakEndHour: null },
  ],
  // Pattern 4 — Mon evening / Thu evening / Sun on-call (mostly emergency cover)
  [
    { dayOffset: 0, startHour: 17, endHour: 21, breakStartHour: null, breakEndHour: null },
    { dayOffset: 3, startHour: 17, endHour: 21, breakStartHour: null, breakEndHour: null },
    { dayOffset: 6, startHour: 10, endHour: 14, breakStartHour: null, breakEndHour: null },
  ],
];

const WEEKS_IN_PAST = 8;
const WEEKS_IN_FUTURE = 4;

interface SeededDoctorContext {
  doctor: Doctor;
  // Ordered list of department ids for this doctor — primary first, then
  // additional affiliations in `DoctorDepartment` insertion order. Length
  // is always >= 1 (guarded in `buildContexts`).
  departmentIds: string[];
}

export async function seedDoctorSchedules(
  prisma: PrismaClient,
  doctors: Doctor[],
  superAdmin: User,
): Promise<number> {
  const doctorIds = doctors.map((d) => d.id);

  await prisma.doctorSchedule.deleteMany({ where: { doctorId: { in: doctorIds } } });

  const affiliations = await prisma.doctorDepartment.findMany({
    where: { doctorId: { in: doctorIds }, deletedAt: null },
  });

  const contexts = buildContexts(doctors, affiliations);
  const weekStart = mondayOfThisWeek();

  let createdCount = 0;

  for (let i = 0; i < contexts.length; i += 1) {
    const ctx = contexts[i]!;
    const pattern = WEEKDAY_PATTERNS[i % WEEKDAY_PATTERNS.length]!;

    for (
      let weekIdx = -WEEKS_IN_PAST;
      weekIdx < WEEKS_IN_FUTURE;
      weekIdx += 1
    ) {
      // `pickDepartmentForWeek` indexes by absolute week, so secondary-
      // affiliated doctors still alternate dept primary↔secondary cleanly
      // across the negative range too.
      const departmentId = pickDepartmentForWeek(ctx, Math.abs(weekIdx));

      for (const template of pattern) {
        const startAt = atUtcHour(weekStart, weekIdx * 7 + template.dayOffset, template.startHour);
        const endAt = atUtcHour(weekStart, weekIdx * 7 + template.dayOffset, template.endHour);
        const hasBreak =
          template.breakStartHour !== null &&
          template.breakEndHour !== null &&
          template.breakEndHour > template.breakStartHour;
        const breakStartAt = hasBreak
          ? atUtcHour(weekStart, weekIdx * 7 + template.dayOffset, template.breakStartHour!)
          : null;
        const breakEndAt = hasBreak
          ? atUtcHour(weekStart, weekIdx * 7 + template.dayOffset, template.breakEndHour!)
          : null;

        await prisma.doctorSchedule.create({
          data: {
            doctorId: ctx.doctor.id,
            departmentId,
            startAt,
            endAt,
            breakStartAt,
            breakEndAt,
            acceptsBooking: true,
            createdBy: superAdmin.id,
          },
        });

        createdCount += 1;
      }
    }
  }

  return createdCount;
}

function buildContexts(
  doctors: Doctor[],
  affiliations: DoctorDepartment[],
): SeededDoctorContext[] {
  const byDoctor = new Map<string, DoctorDepartment[]>();

  for (const aff of affiliations) {
    const list = byDoctor.get(aff.doctorId) ?? [];
    list.push(aff);
    byDoctor.set(aff.doctorId, list);
  }

  return doctors.map((doctor) => {
    const affs = byDoctor.get(doctor.id) ?? [];
    const primary = affs.find((a) => a.isPrimary) ?? affs[0];

    if (!primary) {
      throw new Error(`Doctor ${doctor.doctorCode} has no department affiliation`);
    }

    const additional = affs.filter((a) => a.departmentId !== primary.departmentId);
    const departmentIds = [primary.departmentId, ...additional.map((a) => a.departmentId)];

    return {
      doctor,
      departmentIds,
    };
  });
}

function pickDepartmentForWeek(ctx: SeededDoctorContext, weekIdx: number): string {
  return ctx.departmentIds[weekIdx % ctx.departmentIds.length]!;
}

function mondayOfThisWeek(): Date {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay(); // 0 = Sunday … 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diffToMonday);

  return utc;
}

function atUtcHour(weekStart: Date, dayOffset: number, hour: number): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);

  return d;
}
