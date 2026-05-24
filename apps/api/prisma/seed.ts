/**
 * Dev seed for the Hospital Information System.
 *
 * Idempotent: every entity is upserted by a stable natural key (email, hn,
 * department code, doctor full name + departmentId, etc.) so re-running the
 * seed leaves the DB in the same shape rather than duplicating rows.
 *
 * Per F01 spec the seed populates:
 *   - 6 users — 1 ADMIN + 2 STAFF + 3 PATIENT-linked (one per ownership
 *     bucket: staff1-owned, staff2-owned, self-service). All user emails are
 *     `@gmail.com`.
 *   - 3 departments — Cardiology, Internal Medicine, Pediatrics.
 *   - 5 doctors — distributed 2 / 2 / 1.
 *   - 25 doctor schedules — for each doctor, MON–FRI 09:00–17:00
 *     (540 → 1020). Lunch break 12:00–13:00 (720 → 780) is informational and
 *     enforced by the slot generator, not by splitting rows.
 *   - 10 patients — 3 owned by staff1, 3 owned by staff2, 4 self-service. One
 *     patient in each bucket has a linked User to exercise the 1-1 link.
 *     Patient emails use varied non-gmail domains so they cannot collide with
 *     user @gmail.com addresses.
 *   - 10 appointments — 2 future BOOKED per doctor. Type mix: mostly
 *     FOLLOW_UP, with at least one CONSULTATION and at least one PROCEDURE
 *     (the PROCEDURE has a populated `reason`). `createdByUserId` alternates
 *     between staff1 and staff2.
 */
import {
  AppointmentType,
  DayOfWeek,
  PrismaClient,
  Role,
  type Department,
  type Doctor,
  type Patient,
  type User,
} from '@prisma/client';

import { normalizeEmail } from '../src/common/normalize-email';

const prisma = new PrismaClient();

const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MON,
  DayOfWeek.TUE,
  DayOfWeek.WED,
  DayOfWeek.THU,
  DayOfWeek.FRI,
];

const DAY_START_MINUTE = 9 * 60; // 09:00
const DAY_END_MINUTE = 17 * 60; // 17:00

// Per-type duration map (kept in sync with the application-side const map).
const APPOINTMENT_TYPE_DURATION: Record<AppointmentType, number> = {
  NEW_PATIENT_VISIT: 30,
  FOLLOW_UP: 15,
  CONSULTATION: 20,
  PROCEDURE: 60,
};

interface DepartmentSpec {
  code: string;
  name: string;
}

interface DoctorSpec {
  fullName: string;
  specialty: string;
  departmentCode: string;
}

interface PatientSpec {
  hn: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: Date;
  ownerKey: 'staff1' | 'staff2' | null;
  hasLinkedUser: boolean;
}

interface AppointmentSpec {
  patientHn: string;
  doctorFullName: string;
  appointmentType: AppointmentType;
  startAt: Date;
  reason: string | null;
  createdByEmail: string;
}

async function main(): Promise<void> {
  const departments = await seedDepartments();
  const doctors = await seedDoctors(departments);
  await seedDoctorSchedules(doctors);

  const adminAndStaff = await seedAdminAndStaff();
  const patients = await seedPatients(adminAndStaff);
  await seedPatientUsers(patients);

  const appointmentCount = await seedAppointments(doctors, patients, adminAndStaff);

  // eslint-disable-next-line no-console
  console.log('Seed complete.', {
    users: 1 + 2 + countLinkedPatientUsers(patients),
    departments: Object.keys(departments).length,
    doctors: Object.keys(doctors).length,
    doctorSchedules: Object.keys(doctors).length * WEEKDAYS.length,
    patients: Object.keys(patients).length,
    appointments: appointmentCount,
  });
}

async function seedDepartments(): Promise<Record<string, Department>> {
  const specs: DepartmentSpec[] = [
    { code: 'CARD', name: 'Cardiology' },
    { code: 'INMED', name: 'Internal Medicine' },
    { code: 'PED', name: 'Pediatrics' },
  ];

  const byCode: Record<string, Department> = {};

  for (const spec of specs) {
    const dept = await prisma.department.upsert({
      where: { code: spec.code },
      update: { name: spec.name },
      create: { code: spec.code, name: spec.name },
    });

    byCode[spec.code] = dept;
  }

  return byCode;
}

async function seedDoctors(
  departments: Record<string, Department>,
): Promise<Record<string, Doctor>> {
  const specs: DoctorSpec[] = [
    { fullName: 'Dr. Alice Adams', specialty: 'Interventional Cardiology', departmentCode: 'CARD' },
    { fullName: 'Dr. Somchai Wong', specialty: 'Electrophysiology', departmentCode: 'CARD' },
    { fullName: 'Dr. Ben Brown', specialty: 'General Internal Medicine', departmentCode: 'INMED' },
    { fullName: 'Dr. Nattapong Srisuk', specialty: 'Endocrinology', departmentCode: 'INMED' },
    { fullName: 'Dr. Carla Chen', specialty: 'General Pediatrics', departmentCode: 'PED' },
  ];

  const byName: Record<string, Doctor> = {};

  for (const spec of specs) {
    const department = departments[spec.departmentCode];

    if (!department) {
      throw new Error(`Seed referenced unknown department code: ${spec.departmentCode}`);
    }

    // Doctor has no natural unique key in the schema, so we look up by
    // (departmentId, fullName) and create-or-update to keep the seed
    // idempotent without polluting the schema with a synthetic unique.
    const existing = await prisma.doctor.findFirst({
      where: { fullName: spec.fullName, departmentId: department.id },
    });

    const doctor = existing
      ? await prisma.doctor.update({
          where: { id: existing.id },
          data: { specialty: spec.specialty },
        })
      : await prisma.doctor.create({
          data: {
            fullName: spec.fullName,
            specialty: spec.specialty,
            departmentId: department.id,
          },
        });

    byName[spec.fullName] = doctor;
  }

  return byName;
}

async function seedDoctorSchedules(doctors: Record<string, Doctor>): Promise<void> {
  // Replace-all strategy keeps re-seeding deterministic. Schedules are small
  // and cheap so blowing them away is safer than diffing every (doctor, day)
  // tuple.
  await prisma.doctorSchedule.deleteMany({});

  const effectiveFrom = todayUtcDateOnly();

  for (const doctor of Object.values(doctors)) {
    for (const day of WEEKDAYS) {
      await prisma.doctorSchedule.create({
        data: {
          doctorId: doctor.id,
          departmentId: doctor.departmentId,
          dayOfWeek: day,
          startMinute: DAY_START_MINUTE,
          endMinute: DAY_END_MINUTE,
          acceptsBooking: true,
          effectiveFrom,
        },
      });
    }
  }
}

interface AdminAndStaff {
  admin: User;
  staff1: User;
  staff2: User;
}

async function seedAdminAndStaff(): Promise<AdminAndStaff> {
  const adminEmail = normalizeEmail('admin@gmail.com');
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN, name: 'Hospital Admin' },
    create: { email: adminEmail, role: Role.ADMIN, name: 'Hospital Admin' },
  });

  const staff1Email = normalizeEmail('staff1@gmail.com');
  const staff1 = await prisma.user.upsert({
    where: { email: staff1Email },
    update: { role: Role.STAFF, name: 'Staff One' },
    create: { email: staff1Email, role: Role.STAFF, name: 'Staff One' },
  });

  const staff2Email = normalizeEmail('staff2@gmail.com');
  const staff2 = await prisma.user.upsert({
    where: { email: staff2Email },
    update: { role: Role.STAFF, name: 'Staff Two' },
    create: { email: staff2Email, role: Role.STAFF, name: 'Staff Two' },
  });

  return { admin, staff1, staff2 };
}

async function seedPatients(staff: AdminAndStaff): Promise<Record<string, Patient>> {
  // 3 owned by staff1, 3 owned by staff2, 4 self-service. One per bucket has
  // a linked User (role PATIENT) so the auto-link path is exercised in F02.
  // Patient emails deliberately avoid `@gmail.com` to keep clear of the staff
  // accounts which all live on that domain.
  const specs: PatientSpec[] = [
    // staff1-owned
    {
      hn: 'HN-000001',
      fullName: 'Patient One',
      email: 'patient.one@example.com',
      phone: '+66-2-000-0001',
      dateOfBirth: new Date('1990-01-15'),
      ownerKey: 'staff1',
      hasLinkedUser: true,
    },
    {
      hn: 'HN-000002',
      fullName: 'Patient Two',
      email: 'patient.two@example.com',
      phone: '+66-2-000-0002',
      dateOfBirth: new Date('1985-06-20'),
      ownerKey: 'staff1',
      hasLinkedUser: false,
    },
    {
      hn: 'HN-000003',
      fullName: 'Patient Three',
      email: 'patient.three@example.com',
      phone: '+66-2-000-0003',
      dateOfBirth: new Date('1998-11-02'),
      ownerKey: 'staff1',
      hasLinkedUser: false,
    },
    // staff2-owned
    {
      hn: 'HN-000004',
      fullName: 'Patient Four',
      email: 'patient.four@mail.example',
      phone: '+66-2-000-0004',
      dateOfBirth: new Date('1972-03-30'),
      ownerKey: 'staff2',
      hasLinkedUser: true,
    },
    {
      hn: 'HN-000005',
      fullName: 'Patient Five',
      email: 'patient.five@mail.example',
      phone: '+66-2-000-0005',
      dateOfBirth: new Date('2001-07-12'),
      ownerKey: 'staff2',
      hasLinkedUser: false,
    },
    {
      hn: 'HN-000006',
      fullName: 'Patient Six',
      email: 'patient.six@mail.example',
      phone: '+66-2-000-0006',
      dateOfBirth: new Date('1960-12-05'),
      ownerKey: 'staff2',
      hasLinkedUser: false,
    },
    // self-service
    {
      hn: 'HN-000007',
      fullName: 'Patient Seven',
      email: 'patient.seven@example.org',
      phone: '+66-2-000-0007',
      dateOfBirth: new Date('1993-09-18'),
      ownerKey: null,
      hasLinkedUser: true,
    },
    {
      hn: 'HN-000008',
      fullName: 'Patient Eight',
      email: 'patient.eight@example.org',
      phone: '+66-2-000-0008',
      dateOfBirth: new Date('1988-04-22'),
      ownerKey: null,
      hasLinkedUser: false,
    },
    {
      hn: 'HN-000009',
      fullName: 'Patient Nine',
      email: 'patient.nine@example.org',
      phone: '+66-2-000-0009',
      dateOfBirth: new Date('1979-02-11'),
      ownerKey: null,
      hasLinkedUser: false,
    },
    {
      hn: 'HN-000010',
      fullName: 'Patient Ten',
      email: 'patient.ten@example.org',
      phone: '+66-2-000-0010',
      dateOfBirth: new Date('2003-08-09'),
      ownerKey: null,
      hasLinkedUser: false,
    },
  ];

  const byHn: Record<string, Patient> = {};

  for (const spec of specs) {
    const ownerId = resolveOwnerId(spec.ownerKey, staff);
    const email = normalizeEmail(spec.email);

    const patient = await prisma.patient.upsert({
      where: { hn: spec.hn },
      update: {
        fullName: spec.fullName,
        email,
        phone: spec.phone,
        dateOfBirth: spec.dateOfBirth,
        primaryStaffUserId: ownerId,
      },
      create: {
        hn: spec.hn,
        fullName: spec.fullName,
        email,
        phone: spec.phone,
        dateOfBirth: spec.dateOfBirth,
        primaryStaffUserId: ownerId,
      },
    });

    // Tag the in-memory record so `seedPatientUsers` knows which to link.
    byHn[spec.hn] = Object.assign(patient, { __hasLinkedUser: spec.hasLinkedUser });
  }

  return byHn;
}

function resolveOwnerId(
  ownerKey: PatientSpec['ownerKey'],
  staff: AdminAndStaff,
): string | null {
  if (ownerKey === 'staff1') {
    return staff.staff1.id;
  }

  if (ownerKey === 'staff2') {
    return staff.staff2.id;
  }

  return null;
}

async function seedPatientUsers(patients: Record<string, Patient>): Promise<void> {
  // Only the patients flagged with `__hasLinkedUser` get a User row. Their
  // email mirrors the Patient.email so a future Google sign-in matches the
  // existing record by email. PATIENT users always live on the same domain
  // family as their patient record (non-gmail), so they cannot collide with
  // staff accounts.
  for (const patient of Object.values(patients)) {
    const wantsUser = (patient as Patient & { __hasLinkedUser?: boolean }).__hasLinkedUser;

    if (!wantsUser) {
      continue;
    }

    if (!patient.email) {
      throw new Error(`Patient ${patient.hn} flagged for User link but has no email`);
    }

    const email = normalizeEmail(patient.email);

    await prisma.user.upsert({
      where: { email },
      update: { role: Role.PATIENT, name: patient.fullName, patientId: patient.id },
      create: { email, role: Role.PATIENT, name: patient.fullName, patientId: patient.id },
    });
  }
}

function countLinkedPatientUsers(patients: Record<string, Patient>): number {
  let count = 0;

  for (const patient of Object.values(patients)) {
    if ((patient as Patient & { __hasLinkedUser?: boolean }).__hasLinkedUser) {
      count += 1;
    }
  }

  return count;
}

async function seedAppointments(
  doctors: Record<string, Doctor>,
  patients: Record<string, Patient>,
  staff: AdminAndStaff,
): Promise<number> {
  // Two future BOOKED appointments per doctor: tomorrow 09:00 and the day
  // after tomorrow 14:00. Both fall inside every doctor's MON–FRI 09:00–17:00
  // window — if either lands on a weekend, push to the next Monday so the
  // appointment is always inside a working day.
  const tomorrowMorning = nextWorkingSlot(daysFromTodayUtc(1), 9 * 60);
  const dayAfterAfternoon = nextWorkingSlot(daysFromTodayUtc(2), 14 * 60);

  const doctorOrder = Object.keys(doctors);

  // Type distribution across the 10 appointments — mostly FOLLOW_UP (15 min)
  // with one CONSULTATION (20 min) and one PROCEDURE (60 min). PROCEDURE is
  // placed in an afternoon slot so the 60-min duration still fits the
  // working window. Order: doctor 0 morning, doctor 0 afternoon, doctor 1
  // morning, …
  const typeSequence: AppointmentType[] = [
    AppointmentType.FOLLOW_UP, // d0 morning
    AppointmentType.PROCEDURE, // d0 afternoon (60 min, fits 14:00–15:00)
    AppointmentType.CONSULTATION, // d1 morning
    AppointmentType.FOLLOW_UP, // d1 afternoon
    AppointmentType.FOLLOW_UP, // d2 morning
    AppointmentType.FOLLOW_UP, // d2 afternoon
    AppointmentType.FOLLOW_UP, // d3 morning
    AppointmentType.FOLLOW_UP, // d3 afternoon
    AppointmentType.FOLLOW_UP, // d4 morning
    AppointmentType.FOLLOW_UP, // d4 afternoon
  ];

  // Patients hosting the appointments — rotate across the 10 patient pool so
  // every patient gets exactly one appointment.
  const patientHns = Object.keys(patients);

  const specs: AppointmentSpec[] = [];

  for (let i = 0; i < doctorOrder.length; i += 1) {
    const doctorFullName = doctorOrder[i];
    const slot1Type = typeSequence[i * 2];
    const slot2Type = typeSequence[i * 2 + 1];

    const patient1Hn = patientHns[(i * 2) % patientHns.length];
    const patient2Hn = patientHns[(i * 2 + 1) % patientHns.length];

    const createdBy1 = i % 2 === 0 ? staff.staff1.email : staff.staff2.email;
    const createdBy2 = i % 2 === 0 ? staff.staff2.email : staff.staff1.email;

    specs.push({
      patientHn: patient1Hn,
      doctorFullName,
      appointmentType: slot1Type,
      startAt: tomorrowMorning,
      reason: reasonFor(slot1Type, doctorFullName, 'morning'),
      createdByEmail: createdBy1,
    });

    specs.push({
      patientHn: patient2Hn,
      doctorFullName,
      appointmentType: slot2Type,
      startAt: dayAfterAfternoon,
      reason: reasonFor(slot2Type, doctorFullName, 'afternoon'),
      createdByEmail: createdBy2,
    });
  }

  const staffByEmail = new Map<string, string>([
    [staff.staff1.email, staff.staff1.id],
    [staff.staff2.email, staff.staff2.id],
  ]);

  let count = 0;

  for (const spec of specs) {
    const patient = patients[spec.patientHn];

    if (!patient) {
      throw new Error(`Seed referenced unknown patient HN: ${spec.patientHn}`);
    }

    const doctor = doctors[spec.doctorFullName];

    if (!doctor) {
      throw new Error(`Seed referenced unknown doctor: ${spec.doctorFullName}`);
    }

    const createdByUserId = staffByEmail.get(spec.createdByEmail);

    if (!createdByUserId) {
      throw new Error(`Seed referenced unknown creator email: ${spec.createdByEmail}`);
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
          createdByUserId,
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
          createdByUserId,
        },
      });
    }

    count += 1;
  }

  return count;
}

function reasonFor(
  type: AppointmentType,
  doctorFullName: string,
  slot: 'morning' | 'afternoon',
): string | null {
  if (type === AppointmentType.PROCEDURE) {
    return `Scheduled procedure with ${doctorFullName} (${slot} slot, seed sample).`;
  }

  if (type === AppointmentType.CONSULTATION) {
    return `Routine consultation with ${doctorFullName}.`;
  }

  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function todayUtcDateOnly(): Date {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysFromTodayUtc(offsetDays: number): Date {
  const base = todayUtcDateOnly();
  base.setUTCDate(base.getUTCDate() + offsetDays);

  return base;
}

/**
 * Given a candidate date (UTC date-only) and a minute-of-day, return the next
 * weekday (MON–FRI) at that minute-of-day in UTC. If `candidate` itself is a
 * weekday, that day is used; otherwise the date is rolled forward to Monday.
 * The seed treats clinic-local time as UTC, mirroring the rest of P0.
 */
function nextWorkingSlot(candidate: Date, minuteOfDay: number): Date {
  const result = new Date(candidate.getTime());
  const day = result.getUTCDay();

  if (day === 0) {
    // Sunday → push to Monday.
    result.setUTCDate(result.getUTCDate() + 1);
  } else if (day === 6) {
    // Saturday → push to Monday.
    result.setUTCDate(result.getUTCDate() + 2);
  }

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
