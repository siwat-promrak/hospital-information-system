/**
 * Dev seed for the Hospital Information System.
 *
 * Idempotent: every entity is upserted by a stable natural key (email, hn,
 * department code, doctor full name, etc.) so re-running the seed leaves the
 * DB in the same shape rather than duplicating rows.
 *
 * Per F01 spec the seed populates:
 *   - 1 ADMIN, 2 STAFF, 3 PATIENT users (PATIENT users are linked to a
 *     `Patient` row via `User.patientId`).
 *   - 3 patients — at least one owned by a STAFF user, at least one
 *     self-service (`primaryStaffUserId = null`).
 *   - 2 departments, 3 doctors (2 in one, 1 in the other).
 *   - A handful of weekly recurring schedules.
 *   - One sample BOOKED appointment to exercise FK paths.
 */
import { PrismaClient, Role } from '@prisma/client';

import { normalizeEmail } from '../src/common/normalize-email';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // ─── Departments ─────────────────────────────────────────────────────────
  const cardiology = await prisma.department.upsert({
    where: { code: 'CARD' },
    update: { name: 'Cardiology' },
    create: { code: 'CARD', name: 'Cardiology' },
  });

  const dermatology = await prisma.department.upsert({
    where: { code: 'DERM' },
    update: { name: 'Dermatology' },
    create: { code: 'DERM', name: 'Dermatology' },
  });

  // ─── Doctors ─────────────────────────────────────────────────────────────
  // Doctor has no natural unique key in the schema, so we look up by
  // (departmentId, fullName) and create if missing — this keeps the seed
  // idempotent without polluting the schema with a synthetic unique.
  const doctorSpecs = [
    { fullName: 'Dr. Alice Adams', specialty: 'Interventional Cardiology', departmentId: cardiology.id },
    { fullName: 'Dr. Ben Brown', specialty: 'Electrophysiology', departmentId: cardiology.id },
    { fullName: 'Dr. Carla Chen', specialty: 'Cosmetic Dermatology', departmentId: dermatology.id },
  ];

  const doctors: Record<string, { id: string; departmentId: string }> = {};

  for (const spec of doctorSpecs) {
    const existing = await prisma.doctor.findFirst({
      where: { fullName: spec.fullName, departmentId: spec.departmentId },
    });

    const doctor = existing
      ? await prisma.doctor.update({
          where: { id: existing.id },
          data: { specialty: spec.specialty },
        })
      : await prisma.doctor.create({ data: spec });

    doctors[spec.fullName] = { id: doctor.id, departmentId: doctor.departmentId };
  }

  // ─── Doctor schedules ────────────────────────────────────────────────────
  // Replace-all strategy keeps re-seeding deterministic. Schedules are
  // small and cheap so blowing them away is safer than diffing.
  await prisma.doctorSchedule.deleteMany({});

  const scheduleSpecs = [
    // Dr. Alice — Mon/Wed 09:00–17:00, Cardiology
    { doctorFullName: 'Dr. Alice Adams', dayOfWeek: 1, startMinute: 9 * 60, endMinute: 17 * 60 },
    { doctorFullName: 'Dr. Alice Adams', dayOfWeek: 3, startMinute: 9 * 60, endMinute: 17 * 60 },
    // Dr. Ben — Tue/Thu 10:00–18:00, Cardiology
    { doctorFullName: 'Dr. Ben Brown', dayOfWeek: 2, startMinute: 10 * 60, endMinute: 18 * 60 },
    { doctorFullName: 'Dr. Ben Brown', dayOfWeek: 4, startMinute: 10 * 60, endMinute: 18 * 60 },
    // Dr. Carla — Mon/Wed/Fri 08:00–12:00, Dermatology
    { doctorFullName: 'Dr. Carla Chen', dayOfWeek: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
    { doctorFullName: 'Dr. Carla Chen', dayOfWeek: 3, startMinute: 8 * 60, endMinute: 12 * 60 },
    { doctorFullName: 'Dr. Carla Chen', dayOfWeek: 5, startMinute: 8 * 60, endMinute: 12 * 60 },
  ];

  // Effective from "today minus 30 days" so the seed always has an
  // already-active window even on day 1 of running the project.
  const effectiveFrom = new Date();
  effectiveFrom.setUTCHours(0, 0, 0, 0);
  effectiveFrom.setUTCDate(effectiveFrom.getUTCDate() - 30);

  for (const spec of scheduleSpecs) {
    const doctor = doctors[spec.doctorFullName];

    if (!doctor) {
      throw new Error(`Seed referenced unknown doctor: ${spec.doctorFullName}`);
    }

    await prisma.doctorSchedule.create({
      data: {
        doctorId: doctor.id,
        departmentId: doctor.departmentId,
        dayOfWeek: spec.dayOfWeek,
        startMinute: spec.startMinute,
        endMinute: spec.endMinute,
        effectiveFrom,
      },
    });
  }

  // ─── Staff & admin users ─────────────────────────────────────────────────
  const adminEmail = normalizeEmail('admin@his.local');
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN, name: 'Hospital Admin' },
    create: { email: adminEmail, role: Role.ADMIN, name: 'Hospital Admin' },
  });

  const staff1Email = normalizeEmail('staff.one@his.local');
  const staff1 = await prisma.user.upsert({
    where: { email: staff1Email },
    update: { role: Role.STAFF, name: 'Staff One' },
    create: { email: staff1Email, role: Role.STAFF, name: 'Staff One' },
  });

  const staff2Email = normalizeEmail('staff.two@his.local');
  const staff2 = await prisma.user.upsert({
    where: { email: staff2Email },
    update: { role: Role.STAFF, name: 'Staff Two' },
    create: { email: staff2Email, role: Role.STAFF, name: 'Staff Two' },
  });

  // ─── Patients (3) ────────────────────────────────────────────────────────
  // Patient 1 — owned by staff1 (walk-in style)
  const patient1Email = normalizeEmail('patient.one@example.com');
  const patient1 = await prisma.patient.upsert({
    where: { hn: 'HN-000001' },
    update: {
      fullName: 'Patient One',
      email: patient1Email,
      phone: '+66-2-000-0001',
      dateOfBirth: new Date('1990-01-15'),
      primaryStaffUserId: staff1.id,
    },
    create: {
      hn: 'HN-000001',
      fullName: 'Patient One',
      email: patient1Email,
      phone: '+66-2-000-0001',
      dateOfBirth: new Date('1990-01-15'),
      primaryStaffUserId: staff1.id,
    },
  });

  // Patient 2 — owned by staff2
  const patient2Email = normalizeEmail('patient.two@example.com');
  const patient2 = await prisma.patient.upsert({
    where: { hn: 'HN-000002' },
    update: {
      fullName: 'Patient Two',
      email: patient2Email,
      phone: '+66-2-000-0002',
      dateOfBirth: new Date('1985-06-20'),
      primaryStaffUserId: staff2.id,
    },
    create: {
      hn: 'HN-000002',
      fullName: 'Patient Two',
      email: patient2Email,
      phone: '+66-2-000-0002',
      dateOfBirth: new Date('1985-06-20'),
      primaryStaffUserId: staff2.id,
    },
  });

  // Patient 3 — self-service, primaryStaffUserId left null on purpose to
  // exercise the unassigned ownership path.
  const patient3Email = normalizeEmail('patient.three@example.com');
  const patient3 = await prisma.patient.upsert({
    where: { hn: 'HN-000003' },
    update: {
      fullName: 'Patient Three',
      email: patient3Email,
      phone: '+66-2-000-0003',
      dateOfBirth: new Date('1998-11-02'),
      primaryStaffUserId: null,
    },
    create: {
      hn: 'HN-000003',
      fullName: 'Patient Three',
      email: patient3Email,
      phone: '+66-2-000-0003',
      dateOfBirth: new Date('1998-11-02'),
      primaryStaffUserId: null,
    },
  });

  // ─── Patient users (1-1 link to Patient) ─────────────────────────────────
  // Each patient gets a User with role=PATIENT linked via User.patientId.
  // Email mirrors the Patient.email so Google sign-in resolves to the right
  // record. Patient3 simulates a fresh self-service sign-in pending an admin
  // ownership assignment.
  await prisma.user.upsert({
    where: { email: patient1Email },
    update: { role: Role.PATIENT, name: patient1.fullName, patientId: patient1.id },
    create: { email: patient1Email, role: Role.PATIENT, name: patient1.fullName, patientId: patient1.id },
  });

  await prisma.user.upsert({
    where: { email: patient2Email },
    update: { role: Role.PATIENT, name: patient2.fullName, patientId: patient2.id },
    create: { email: patient2Email, role: Role.PATIENT, name: patient2.fullName, patientId: patient2.id },
  });

  await prisma.user.upsert({
    where: { email: patient3Email },
    update: { role: Role.PATIENT, name: patient3.fullName, patientId: patient3.id },
    create: { email: patient3Email, role: Role.PATIENT, name: patient3.fullName, patientId: patient3.id },
  });

  // ─── Sample appointment (BOOKED, future) ────────────────────────────────
  // Pick a future weekday inside Dr. Alice's schedule (Mon = 1).
  const future = nextWeekday(1, 9 * 60); // next Monday 09:00 local
  const alice = doctors['Dr. Alice Adams'];

  if (!alice) {
    throw new Error('Seed expected Dr. Alice Adams to exist');
  }

  // Find/replace this seed's single sample appointment by a stable shape
  // (patient + doctor + startAt) so re-runs don't multiply rows.
  const existingAppt = await prisma.appointment.findFirst({
    where: { patientId: patient1.id, doctorId: alice.id, startAt: future },
  });

  if (existingAppt) {
    await prisma.appointment.update({
      where: { id: existingAppt.id },
      data: { endAt: addMinutes(future, 20), status: 'BOOKED' },
    });
  } else {
    await prisma.appointment.create({
      data: {
        patientId: patient1.id,
        doctorId: alice.id,
        departmentId: alice.departmentId,
        appointmentType: 'CONSULTATION',
        startAt: future,
        endAt: addMinutes(future, 20),
        createdByUserId: staff1.id,
        reason: 'Routine cardiology consultation (seed sample).',
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete.', {
    admins: 1,
    staff: 2,
    patients: 3,
    departments: 2,
    doctors: Object.keys(doctors).length,
    schedules: scheduleSpecs.length,
    sampleAppointment: { adminUser: adminUser.email, doctor: 'Dr. Alice Adams', startAt: future.toISOString() },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Returns the next occurrence of the given weekday (0 = Sun … 6 = Sat) at the
 * given clinic-local minute-of-day, expressed in UTC. "Next" means strictly
 * in the future relative to now, so re-running the seed always lands on a
 * forward-looking slot.
 *
 * For simplicity, the seed treats clinic-local time as UTC. A future feature
 * may add a clinic timezone column; the seed will be updated then.
 */
function nextWeekday(targetDay: number, minuteOfDay: number): Date {
  const now = new Date();
  const result = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentDay = result.getUTCDay();
  let delta = (targetDay - currentDay + 7) % 7;

  if (delta === 0) {
    delta = 7;
  }

  result.setUTCDate(result.getUTCDate() + delta);
  result.setUTCHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);

  return result;
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
