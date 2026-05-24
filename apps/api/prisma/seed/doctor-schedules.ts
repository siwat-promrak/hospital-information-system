/**
 * Seeds a MON-FRI 09:00-17:00 (540 -> 1020) working window with a 12:00-13:00
 * (720 -> 780) break for every Doctor. Depends on doctors.ts. Re-running the
 * seed replaces all schedules via deleteMany so the result is deterministic
 * regardless of prior state.
 */
import { DayOfWeek, PrismaClient, type Doctor, type User } from '@prisma/client';

const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MON,
  DayOfWeek.TUE,
  DayOfWeek.WED,
  DayOfWeek.THU,
  DayOfWeek.FRI,
];

const DAY_START_MINUTE = 9 * 60; // 09:00
const DAY_END_MINUTE = 17 * 60; // 17:00
const BREAK_START_MINUTE = 12 * 60; // 12:00
const BREAK_END_MINUTE = 13 * 60; // 13:00

export async function seedDoctorSchedules(
  prisma: PrismaClient,
  doctors: Doctor[],
  superAdmin: User,
): Promise<void> {
  // Replace-all strategy keeps re-seeding deterministic. Schedules are small
  // and cheap so blowing them away is safer than diffing every (doctor, day)
  // tuple.
  await prisma.doctorSchedule.deleteMany({});

  const effectiveFrom = todayUtcDateOnly();

  for (const doctor of doctors) {
    for (const day of WEEKDAYS) {
      await prisma.doctorSchedule.create({
        data: {
          doctorId: doctor.id,
          dayOfWeek: day,
          startMinute: DAY_START_MINUTE,
          endMinute: DAY_END_MINUTE,
          breakStartMinute: BREAK_START_MINUTE,
          breakEndMinute: BREAK_END_MINUTE,
          acceptsBooking: true,
          effectiveFrom,
          createdBy: superAdmin.id,
        },
      });
    }
  }
}

function todayUtcDateOnly(): Date {
  const now = new Date();

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
