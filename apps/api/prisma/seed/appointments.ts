/**
 * Seeds 10 BOOKED appointments — 2 per doctor — distributed across tomorrow
 * morning and the day-after-tomorrow afternoon. Type mix: 8 FOLLOW_UP, 1
 * CONSULTATION, 1 PROCEDURE (which carries `reason`). `createdByUserId`
 * alternates between the two clinic-operator admins (legacy staff1 / staff2
 * emails — renamed in a follow-up commit). Depends on doctors.ts,
 * patients.ts, and users.ts (ADMIN users) — appointments need real ids from
 * all three.
 */
import {
  AppointmentType,
  PrismaClient,
  type Doctor,
  type Patient,
  type User,
} from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

// Per-type duration map (kept in sync with the application-side const map).
const APPOINTMENT_TYPE_DURATION: Record<AppointmentType, number> = {
  NEW_PATIENT_VISIT: 30,
  FOLLOW_UP: 15,
  CONSULTATION: 20,
  PROCEDURE: 60,
};

interface AppointmentSpec {
  patientHn: string;
  doctorCode: string;
  appointmentType: AppointmentType;
  startAt: Date;
  reason: string | null;
  createdByUserId: string;
}

export async function seedAppointments(
  prisma: PrismaClient,
  doctors: Doctor[],
  patients: Patient[],
  admins: User[],
): Promise<number> {
  const adminsByEmail = new Map(admins.map((u) => [u.email, u]));
  const admin1 = adminsByEmail.get(normalizeEmail('staff1@gmail.com'));
  const admin2 = adminsByEmail.get(normalizeEmail('staff2@gmail.com'));

  if (!admin1 || !admin2) {
    throw new Error('Seed expected the two clinic-operator admins (staff1, staff2) to be present');
  }

  // Two future BOOKED appointments per doctor: tomorrow 09:00 and the day
  // after tomorrow 14:00. Both fall inside every doctor's MON-FRI 09:00-17:00
  // window — if either lands on a weekend, push to the next Monday so the
  // appointment is always inside a working day.
  const tomorrowMorning = nextWorkingSlot(daysFromTodayUtc(1), 9 * 60);
  const dayAfterAfternoon = nextWorkingSlot(daysFromTodayUtc(2), 14 * 60);

  // Type distribution across the 10 appointments — mostly FOLLOW_UP (15 min)
  // with one CONSULTATION (20 min) and one PROCEDURE (60 min). PROCEDURE is
  // placed in an afternoon slot so the 60-min duration still fits the working
  // window. Order: doctor 0 morning, doctor 0 afternoon, doctor 1 morning, …
  const typeSequence: AppointmentType[] = [
    AppointmentType.FOLLOW_UP, // d0 morning
    AppointmentType.PROCEDURE, // d0 afternoon (60 min, fits 14:00-15:00)
    AppointmentType.CONSULTATION, // d1 morning
    AppointmentType.FOLLOW_UP, // d1 afternoon
    AppointmentType.FOLLOW_UP, // d2 morning
    AppointmentType.FOLLOW_UP, // d2 afternoon
    AppointmentType.FOLLOW_UP, // d3 morning
    AppointmentType.FOLLOW_UP, // d3 afternoon
    AppointmentType.FOLLOW_UP, // d4 morning
    AppointmentType.FOLLOW_UP, // d4 afternoon
  ];

  const patientsByHn = new Map(patients.map((p) => [p.hn, p]));
  const doctorsByCode = new Map(doctors.map((d) => [d.doctorCode, d]));

  const patientHns = patients.map((p) => p.hn);
  const doctorCodes = doctors.map((d) => d.doctorCode);

  const specs: AppointmentSpec[] = [];

  for (let i = 0; i < doctorCodes.length; i += 1) {
    const doctorCode = doctorCodes[i];
    const slot1Type = typeSequence[i * 2];
    const slot2Type = typeSequence[i * 2 + 1];

    const patient1Hn = patientHns[(i * 2) % patientHns.length];
    const patient2Hn = patientHns[(i * 2 + 1) % patientHns.length];

    const createdBy1 = i % 2 === 0 ? admin1.id : admin2.id;
    const createdBy2 = i % 2 === 0 ? admin2.id : admin1.id;

    specs.push({
      patientHn: patient1Hn,
      doctorCode,
      appointmentType: slot1Type,
      startAt: tomorrowMorning,
      reason: reasonFor(slot1Type, doctorCode, 'morning'),
      createdByUserId: createdBy1,
    });

    specs.push({
      patientHn: patient2Hn,
      doctorCode,
      appointmentType: slot2Type,
      startAt: dayAfterAfternoon,
      reason: reasonFor(slot2Type, doctorCode, 'afternoon'),
      createdByUserId: createdBy2,
    });
  }

  let count = 0;

  for (const spec of specs) {
    const patient = patientsByHn.get(spec.patientHn);

    if (!patient) {
      throw new Error(`Seed referenced unknown patient HN: ${spec.patientHn}`);
    }

    const doctor = doctorsByCode.get(spec.doctorCode);

    if (!doctor) {
      throw new Error(`Seed referenced unknown doctor code: ${spec.doctorCode}`);
    }

    const duration = APPOINTMENT_TYPE_DURATION[spec.appointmentType];
    const endAt = addMinutes(spec.startAt, duration);

    // Appointment has no schema-level unique key on (patient, doctor,
    // startAt), so guard idempotency with a findFirst+create-or-update. The
    // shape (patient + doctor + startAt) is stable across re-runs because the
    // helpers above always resolve to the same future slot for a given day.
    const existing = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        doctorId: doctor.id,
        startAt: spec.startAt,
      },
    });

    if (existing) {
      await prisma.appointment.update({
        where: { id: existing.id },
        data: {
          departmentId: doctor.departmentId,
          appointmentType: spec.appointmentType,
          endAt,
          reason: spec.reason,
          createdByUserId: spec.createdByUserId,
          status: 'BOOKED',
        },
      });
    } else {
      await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          departmentId: doctor.departmentId,
          appointmentType: spec.appointmentType,
          startAt: spec.startAt,
          endAt,
          reason: spec.reason,
          createdByUserId: spec.createdByUserId,
        },
      });
    }

    count += 1;
  }

  return count;
}

function reasonFor(
  type: AppointmentType,
  doctorCode: string,
  slot: 'morning' | 'afternoon',
): string | null {
  if (type === AppointmentType.PROCEDURE) {
    return `Scheduled procedure with ${doctorCode} (${slot} slot, seed sample).`;
  }

  if (type === AppointmentType.CONSULTATION) {
    return `Routine consultation with ${doctorCode}.`;
  }

  return null;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function todayUtcDateOnly(): Date {
  const now = new Date();

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function daysFromTodayUtc(offsetDays: number): Date {
  const base = todayUtcDateOnly();
  base.setUTCDate(base.getUTCDate() + offsetDays);

  return base;
}

/**
 * Given a candidate date (UTC date-only) and a minute-of-day, return the next
 * weekday (MON-FRI) at that minute-of-day in UTC. If `candidate` itself is a
 * weekday, that day is used; otherwise the date is rolled forward to Monday.
 * The seed treats clinic-local time as UTC, mirroring the rest of P0.
 */
function nextWorkingSlot(candidate: Date, minuteOfDay: number): Date {
  const result = new Date(candidate.getTime());
  const day = result.getUTCDay();

  if (day === 0) {
    // Sunday -> push to Monday.
    result.setUTCDate(result.getUTCDate() + 1);
  } else if (day === 6) {
    // Saturday -> push to Monday.
    result.setUTCDate(result.getUTCDate() + 2);
  }

  result.setUTCHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);

  return result;
}
