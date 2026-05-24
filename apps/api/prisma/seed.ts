/**
 * Dev seed for the Hospital Information System.
 *
 * Idempotent: every entity is upserted by a stable natural key (email, hn,
 * doctor_code, department name, …) so re-running the seed leaves the DB in
 * the same shape rather than duplicating rows.
 *
 * Bootstrap rule: the **super-admin** user is seeded at the nil UUID
 * (`00000000-0000-0000-0000-000000000000`) and becomes the default
 * `created_by` for every other seed row. The super-admin's own `created_by`
 * column self-references its own id — Postgres allows the single-row INSERT
 * because the FK is checked at end of statement and the row already exists
 * by then. The `users_created_by_fkey` FK is declared `ON DELETE NO ACTION`
 * so the super-admin row stays referenced forever; the seed never deletes
 * it.
 *
 * Per the F01 spec the seed populates:
 *   - 19 users — 1 super admin + 1 admin + 2 staff + 5 doctors + 10 patients
 *     (all `@gmail.com`, `googleSub` null).
 *   - 3 departments — Cardiology, Internal Medicine, Pediatrics.
 *   - 5 doctors — distributed 2 / 2 / 1 across the departments.
 *   - 25 doctor schedules — MON–FRI 09:00–17:00 (540 → 1020) with a
 *     12:00–13:00 (720 → 780) break per doctor.
 *   - 10 patients — 3 owned by staff1, 3 owned by staff2, 4 self-service.
 *   - 10 appointments — 2 per doctor, mix of FOLLOW_UP / CONSULTATION /
 *     PROCEDURE; `createdByUserId` alternates between staff1 and staff2.
 */
import {
  AppointmentType,
  BloodGroup,
  DayOfWeek,
  Gender,
  PrismaClient,
  Role,
  type Department,
  type Doctor,
  type Patient,
  type User,
} from '@prisma/client';

import { normalizeEmail } from '../src/common/normalize-email';

const prisma = new PrismaClient();

const SUPER_ADMIN_ID = '00000000-0000-0000-0000-000000000000';

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

// Per-type duration map (kept in sync with the application-side const map).
const APPOINTMENT_TYPE_DURATION: Record<AppointmentType, number> = {
  NEW_PATIENT_VISIT: 30,
  FOLLOW_UP: 15,
  CONSULTATION: 20,
  PROCEDURE: 60,
};

interface UserSpec {
  email: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
  role: Role;
}

interface DepartmentSpec {
  name: string;
  description: string;
}

interface DoctorSpec {
  userEmail: string;
  departmentName: string;
  doctorCode: string;
  medicalLicenseNo: string;
  gender: Gender | null;
  phone: string;
  address: string | null;
}

interface PatientSpec {
  userEmail: string;
  hn: string;
  dateOfBirth: Date;
  gender: Gender;
  bloodGroup: BloodGroup;
  identificationNo: string;
  phone: string;
  emergencyPersonName: string;
  emergencyPersonRelation: string;
  emergencyPersonPhone: string;
  address: string;
  ownerKey: 'staff1' | 'staff2' | null;
}

interface AppointmentSpec {
  patientHn: string;
  doctorCode: string;
  appointmentType: AppointmentType;
  startAt: Date;
  reason: string | null;
  createdByEmail: string;
}

async function main(): Promise<void> {
  const superAdmin = await seedSuperAdmin();
  const usersByEmail = await seedUsers(superAdmin);
  const departments = await seedDepartments(superAdmin);
  const doctors = await seedDoctors(superAdmin, usersByEmail, departments);
  await seedDoctorSchedules(superAdmin, doctors);

  const staff1 = requireUser(usersByEmail, 'staff1@gmail.com');
  const staff2 = requireUser(usersByEmail, 'staff2@gmail.com');
  const patients = await seedPatients(superAdmin, usersByEmail, staff1, staff2);
  const appointmentCount = await seedAppointments(
    doctors,
    patients,
    staff1,
    staff2,
  );

  // eslint-disable-next-line no-console
  console.log('Seed complete.', {
    users: Object.keys(usersByEmail).length + 1, // +1 for super admin
    departments: Object.keys(departments).length,
    doctors: Object.keys(doctors).length,
    doctorSchedules: Object.keys(doctors).length * WEEKDAYS.length,
    patients: Object.keys(patients).length,
    appointments: appointmentCount,
  });
}

/**
 * Insert (or refresh) the super-admin User at the nil UUID. Its `created_by`
 * column self-references its own id — Postgres allows this in a single-row
 * INSERT because the FK check fires at end of statement and the row already
 * exists by then.
 */
async function seedSuperAdmin(): Promise<User> {
  const email = normalizeEmail('superadmin@gmail.com');

  return prisma.user.upsert({
    where: { id: SUPER_ADMIN_ID },
    update: {
      email,
      role: Role.ADMIN,
      firstNameEn: 'Super',
      lastNameEn: 'Admin',
      firstNameTh: null,
      lastNameTh: null,
    },
    create: {
      id: SUPER_ADMIN_ID,
      email,
      role: Role.ADMIN,
      firstNameEn: 'Super',
      lastNameEn: 'Admin',
      firstNameTh: null,
      lastNameTh: null,
      createdBy: SUPER_ADMIN_ID,
    },
  });
}

async function seedUsers(superAdmin: User): Promise<Record<string, User>> {
  const specs: UserSpec[] = [
    // Additional ADMIN
    {
      email: 'admin@gmail.com',
      firstNameEn: 'Hospital',
      lastNameEn: 'Admin',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.ADMIN,
    },
    // STAFF
    {
      email: 'staff1@gmail.com',
      firstNameEn: 'Sarah',
      lastNameEn: 'Smith',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.STAFF,
    },
    {
      email: 'staff2@gmail.com',
      firstNameEn: 'Kanya',
      lastNameEn: 'Ratchaphon',
      firstNameTh: 'กัญญา',
      lastNameTh: 'ราชพล',
      role: Role.STAFF,
    },
    // DOCTORS (5)
    {
      email: 'doctor.somchai@gmail.com',
      firstNameEn: 'Somchai',
      lastNameEn: 'Wong',
      firstNameTh: 'สมชาย',
      lastNameTh: 'วงศ์',
      role: Role.DOCTOR,
    },
    {
      email: 'doctor.alice@gmail.com',
      firstNameEn: 'Alice',
      lastNameEn: 'Adams',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.DOCTOR,
    },
    {
      email: 'doctor.nattapong@gmail.com',
      firstNameEn: 'Nattapong',
      lastNameEn: 'Srisuk',
      firstNameTh: 'ณัฐพงศ์',
      lastNameTh: 'ศรีสุข',
      role: Role.DOCTOR,
    },
    {
      email: 'doctor.ben@gmail.com',
      firstNameEn: 'Ben',
      lastNameEn: 'Brown',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.DOCTOR,
    },
    {
      email: 'doctor.carla@gmail.com',
      firstNameEn: 'Carla',
      lastNameEn: 'Chen',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.DOCTOR,
    },
    // PATIENTS (10)
    {
      email: 'patient.one@gmail.com',
      firstNameEn: 'Patient',
      lastNameEn: 'One',
      firstNameTh: 'หนึ่ง',
      lastNameTh: 'ใจดี',
      role: Role.PATIENT,
    },
    {
      email: 'patient.two@gmail.com',
      firstNameEn: 'Patient',
      lastNameEn: 'Two',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.PATIENT,
    },
    {
      email: 'patient.three@gmail.com',
      firstNameEn: 'Niran',
      lastNameEn: 'Phongphan',
      firstNameTh: 'นิรันดร์',
      lastNameTh: 'พงษ์พันธ์',
      role: Role.PATIENT,
    },
    {
      email: 'patient.four@gmail.com',
      firstNameEn: 'Patient',
      lastNameEn: 'Four',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.PATIENT,
    },
    {
      email: 'patient.five@gmail.com',
      firstNameEn: 'Apirak',
      lastNameEn: 'Charoen',
      firstNameTh: 'อภิรักษ์',
      lastNameTh: 'เจริญ',
      role: Role.PATIENT,
    },
    {
      email: 'patient.six@gmail.com',
      firstNameEn: 'Patient',
      lastNameEn: 'Six',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.PATIENT,
    },
    {
      email: 'patient.seven@gmail.com',
      firstNameEn: 'Patient',
      lastNameEn: 'Seven',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.PATIENT,
    },
    {
      email: 'patient.eight@gmail.com',
      firstNameEn: 'Suchada',
      lastNameEn: 'Boonmee',
      firstNameTh: 'สุชาดา',
      lastNameTh: 'บุญมี',
      role: Role.PATIENT,
    },
    {
      email: 'patient.nine@gmail.com',
      firstNameEn: 'Patient',
      lastNameEn: 'Nine',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.PATIENT,
    },
    {
      email: 'patient.ten@gmail.com',
      firstNameEn: 'Patient',
      lastNameEn: 'Ten',
      firstNameTh: null,
      lastNameTh: null,
      role: Role.PATIENT,
    },
  ];

  const byEmail: Record<string, User> = {};

  for (const spec of specs) {
    const email = normalizeEmail(spec.email);
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        firstNameEn: spec.firstNameEn,
        lastNameEn: spec.lastNameEn,
        firstNameTh: spec.firstNameTh,
        lastNameTh: spec.lastNameTh,
        role: spec.role,
      },
      create: {
        email,
        firstNameEn: spec.firstNameEn,
        lastNameEn: spec.lastNameEn,
        firstNameTh: spec.firstNameTh,
        lastNameTh: spec.lastNameTh,
        role: spec.role,
        createdBy: superAdmin.id,
      },
    });

    byEmail[email] = user;
  }

  return byEmail;
}

async function seedDepartments(
  superAdmin: User,
): Promise<Record<string, Department>> {
  const specs: DepartmentSpec[] = [
    {
      name: 'Cardiology',
      description: 'Heart, vasculature, and cardiovascular procedures.',
    },
    {
      name: 'Internal Medicine',
      description: 'Adult primary care and chronic-condition management.',
    },
    {
      name: 'Pediatrics',
      description: 'Pediatric primary care and developmental medicine.',
    },
  ];

  const byName: Record<string, Department> = {};

  for (const spec of specs) {
    const department = await prisma.department.upsert({
      where: { name: spec.name },
      update: { description: spec.description },
      create: {
        name: spec.name,
        description: spec.description,
        createdBy: superAdmin.id,
      },
    });

    byName[spec.name] = department;
  }

  return byName;
}

async function seedDoctors(
  superAdmin: User,
  usersByEmail: Record<string, User>,
  departments: Record<string, Department>,
): Promise<Record<string, Doctor>> {
  const specs: DoctorSpec[] = [
    {
      userEmail: 'doctor.somchai@gmail.com',
      departmentName: 'Cardiology',
      doctorCode: 'MD-0001',
      medicalLicenseNo: 'MED-2026-0001',
      gender: Gender.MALE,
      phone: '+66-2-100-0001',
      address: '123 Sukhumvit Rd, Bangkok 10110',
    },
    {
      userEmail: 'doctor.alice@gmail.com',
      departmentName: 'Cardiology',
      doctorCode: 'MD-0002',
      medicalLicenseNo: 'MED-2026-0002',
      gender: Gender.FEMALE,
      phone: '+66-2-100-0002',
      address: null,
    },
    {
      userEmail: 'doctor.nattapong@gmail.com',
      departmentName: 'Internal Medicine',
      doctorCode: 'MD-0003',
      medicalLicenseNo: 'MED-2026-0003',
      gender: Gender.MALE,
      phone: '+66-2-100-0003',
      address: '45 Phaholyothin Rd, Bangkok 10400',
    },
    {
      userEmail: 'doctor.ben@gmail.com',
      departmentName: 'Internal Medicine',
      doctorCode: 'MD-0004',
      medicalLicenseNo: 'MED-2026-0004',
      gender: null,
      phone: '+66-2-100-0004',
      address: null,
    },
    {
      userEmail: 'doctor.carla@gmail.com',
      departmentName: 'Pediatrics',
      doctorCode: 'MD-0005',
      medicalLicenseNo: 'MED-2026-0005',
      gender: Gender.FEMALE,
      phone: '+66-2-100-0005',
      address: '88 Silom Rd, Bangkok 10500',
    },
  ];

  const byCode: Record<string, Doctor> = {};

  for (const spec of specs) {
    const user = requireUser(usersByEmail, spec.userEmail);
    const department = departments[spec.departmentName];

    if (!department) {
      throw new Error(
        `Seed referenced unknown department: ${spec.departmentName}`,
      );
    }

    const doctor = await prisma.doctor.upsert({
      where: { doctorCode: spec.doctorCode },
      update: {
        userId: user.id,
        departmentId: department.id,
        medicalLicenseNo: spec.medicalLicenseNo,
        gender: spec.gender,
        phone: spec.phone,
        address: spec.address,
      },
      create: {
        userId: user.id,
        departmentId: department.id,
        doctorCode: spec.doctorCode,
        medicalLicenseNo: spec.medicalLicenseNo,
        gender: spec.gender,
        phone: spec.phone,
        address: spec.address,
        createdBy: superAdmin.id,
      },
    });

    byCode[spec.doctorCode] = doctor;
  }

  return byCode;
}

async function seedDoctorSchedules(
  superAdmin: User,
  doctors: Record<string, Doctor>,
): Promise<void> {
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

async function seedPatients(
  superAdmin: User,
  usersByEmail: Record<string, User>,
  staff1: User,
  staff2: User,
): Promise<Record<string, Patient>> {
  // 3 owned by staff1, 3 owned by staff2, 4 self-service. Each Patient row is
  // 1-1 with a PATIENT User created in `seedUsers`. Identification mixes
  // 13-digit Thai national IDs with passport-style strings; blood groups mix
  // common types with UNKNOWN to exercise the default.
  const specs: PatientSpec[] = [
    // staff1-owned (3)
    {
      userEmail: 'patient.one@gmail.com',
      hn: 'HN-2026-0001',
      dateOfBirth: new Date('1990-01-15'),
      gender: Gender.FEMALE,
      bloodGroup: BloodGroup.O_POSITIVE,
      identificationNo: '1100400123456',
      phone: '+66-81-000-0001',
      emergencyPersonName: 'Somsri One',
      emergencyPersonRelation: 'Mother',
      emergencyPersonPhone: '+66-81-100-0001',
      address: '12 Soi 1, Lat Phrao Rd, Bangkok 10230',
      ownerKey: 'staff1',
    },
    {
      userEmail: 'patient.two@gmail.com',
      hn: 'HN-2026-0002',
      dateOfBirth: new Date('1985-06-20'),
      gender: Gender.MALE,
      bloodGroup: BloodGroup.A_POSITIVE,
      identificationNo: 'P12345678',
      phone: '+66-81-000-0002',
      emergencyPersonName: 'Jane Two',
      emergencyPersonRelation: 'Spouse',
      emergencyPersonPhone: '+66-81-100-0002',
      address: '34 Soi 2, Ratchada Rd, Bangkok 10310',
      ownerKey: 'staff1',
    },
    {
      userEmail: 'patient.three@gmail.com',
      hn: 'HN-2026-0003',
      dateOfBirth: new Date('1998-11-02'),
      gender: Gender.MALE,
      bloodGroup: BloodGroup.B_NEGATIVE,
      identificationNo: '1100400345678',
      phone: '+66-81-000-0003',
      emergencyPersonName: 'Suda Phongphan',
      emergencyPersonRelation: 'Sister',
      emergencyPersonPhone: '+66-81-100-0003',
      address: '56 Soi 3, Phetchaburi Rd, Bangkok 10400',
      ownerKey: 'staff1',
    },
    // staff2-owned (3)
    {
      userEmail: 'patient.four@gmail.com',
      hn: 'HN-2026-0004',
      dateOfBirth: new Date('1972-03-30'),
      gender: Gender.FEMALE,
      bloodGroup: BloodGroup.AB_POSITIVE,
      identificationNo: '1100400456789',
      phone: '+66-81-000-0004',
      emergencyPersonName: 'Marcus Four',
      emergencyPersonRelation: 'Son',
      emergencyPersonPhone: '+66-81-100-0004',
      address: '78 Soi 4, Rama 9 Rd, Bangkok 10310',
      ownerKey: 'staff2',
    },
    {
      userEmail: 'patient.five@gmail.com',
      hn: 'HN-2026-0005',
      dateOfBirth: new Date('2001-07-12'),
      gender: Gender.MALE,
      bloodGroup: BloodGroup.O_NEGATIVE,
      identificationNo: '1100400567890',
      phone: '+66-81-000-0005',
      emergencyPersonName: 'Wipa Charoen',
      emergencyPersonRelation: 'Mother',
      emergencyPersonPhone: '+66-81-100-0005',
      address: '90 Soi 5, Sathorn Rd, Bangkok 10120',
      ownerKey: 'staff2',
    },
    {
      userEmail: 'patient.six@gmail.com',
      hn: 'HN-2026-0006',
      dateOfBirth: new Date('1960-12-05'),
      gender: Gender.MALE,
      bloodGroup: BloodGroup.UNKNOWN,
      identificationNo: 'P87654321',
      phone: '+66-81-000-0006',
      emergencyPersonName: 'Lee Six',
      emergencyPersonRelation: 'Friend',
      emergencyPersonPhone: '+66-81-100-0006',
      address: '11 Soi 6, Asoke Rd, Bangkok 10110',
      ownerKey: 'staff2',
    },
    // self-service (4)
    {
      userEmail: 'patient.seven@gmail.com',
      hn: 'HN-2026-0007',
      dateOfBirth: new Date('1993-09-18'),
      gender: Gender.FEMALE,
      bloodGroup: BloodGroup.A_NEGATIVE,
      identificationNo: '1100400789012',
      phone: '+66-81-000-0007',
      emergencyPersonName: 'Kim Seven',
      emergencyPersonRelation: 'Sister',
      emergencyPersonPhone: '+66-81-100-0007',
      address: '22 Soi 7, Thonglor, Bangkok 10110',
      ownerKey: null,
    },
    {
      userEmail: 'patient.eight@gmail.com',
      hn: 'HN-2026-0008',
      dateOfBirth: new Date('1988-04-22'),
      gender: Gender.FEMALE,
      bloodGroup: BloodGroup.B_POSITIVE,
      identificationNo: '1100400890123',
      phone: '+66-81-000-0008',
      emergencyPersonName: 'Anan Boonmee',
      emergencyPersonRelation: 'Brother',
      emergencyPersonPhone: '+66-81-100-0008',
      address: '33 Soi 8, Ekkamai, Bangkok 10110',
      ownerKey: null,
    },
    {
      userEmail: 'patient.nine@gmail.com',
      hn: 'HN-2026-0009',
      dateOfBirth: new Date('1979-02-11'),
      gender: Gender.MALE,
      bloodGroup: BloodGroup.AB_NEGATIVE,
      identificationNo: 'P11122233',
      phone: '+66-81-000-0009',
      emergencyPersonName: 'Pat Nine',
      emergencyPersonRelation: 'Spouse',
      emergencyPersonPhone: '+66-81-100-0009',
      address: '44 Soi 9, Bang Na, Bangkok 10260',
      ownerKey: null,
    },
    {
      userEmail: 'patient.ten@gmail.com',
      hn: 'HN-2026-0010',
      dateOfBirth: new Date('2003-08-09'),
      gender: Gender.FEMALE,
      bloodGroup: BloodGroup.UNKNOWN,
      identificationNo: '1100400112233',
      phone: '+66-81-000-0010',
      emergencyPersonName: 'Pim Ten',
      emergencyPersonRelation: 'Mother',
      emergencyPersonPhone: '+66-81-100-0010',
      address: '55 Soi 10, Bang Sue, Bangkok 10800',
      ownerKey: null,
    },
  ];

  const byHn: Record<string, Patient> = {};

  for (const spec of specs) {
    const user = requireUser(usersByEmail, spec.userEmail);
    const ownerId = resolveOwnerId(spec.ownerKey, staff1, staff2);

    const patient = await prisma.patient.upsert({
      where: { hn: spec.hn },
      update: {
        userId: user.id,
        dateOfBirth: spec.dateOfBirth,
        gender: spec.gender,
        bloodGroup: spec.bloodGroup,
        identificationNo: spec.identificationNo,
        phone: spec.phone,
        emergencyPersonName: spec.emergencyPersonName,
        emergencyPersonRelation: spec.emergencyPersonRelation,
        emergencyPersonPhone: spec.emergencyPersonPhone,
        address: spec.address,
        primaryStaffUserId: ownerId,
      },
      create: {
        userId: user.id,
        hn: spec.hn,
        dateOfBirth: spec.dateOfBirth,
        gender: spec.gender,
        bloodGroup: spec.bloodGroup,
        identificationNo: spec.identificationNo,
        phone: spec.phone,
        emergencyPersonName: spec.emergencyPersonName,
        emergencyPersonRelation: spec.emergencyPersonRelation,
        emergencyPersonPhone: spec.emergencyPersonPhone,
        address: spec.address,
        primaryStaffUserId: ownerId,
        createdBy: superAdmin.id,
      },
    });

    byHn[spec.hn] = patient;
  }

  return byHn;
}

function resolveOwnerId(
  ownerKey: PatientSpec['ownerKey'],
  staff1: User,
  staff2: User,
): string | null {
  if (ownerKey === 'staff1') {
    return staff1.id;
  }

  if (ownerKey === 'staff2') {
    return staff2.id;
  }

  return null;
}

async function seedAppointments(
  doctors: Record<string, Doctor>,
  patients: Record<string, Patient>,
  staff1: User,
  staff2: User,
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
    const doctorCode = doctorOrder[i];
    const slot1Type = typeSequence[i * 2];
    const slot2Type = typeSequence[i * 2 + 1];

    const patient1Hn = patientHns[(i * 2) % patientHns.length];
    const patient2Hn = patientHns[(i * 2 + 1) % patientHns.length];

    const createdBy1 = i % 2 === 0 ? staff1.email : staff2.email;
    const createdBy2 = i % 2 === 0 ? staff2.email : staff1.email;

    specs.push({
      patientHn: patient1Hn,
      doctorCode,
      appointmentType: slot1Type,
      startAt: tomorrowMorning,
      reason: reasonFor(slot1Type, doctorCode, 'morning'),
      createdByEmail: createdBy1,
    });

    specs.push({
      patientHn: patient2Hn,
      doctorCode,
      appointmentType: slot2Type,
      startAt: dayAfterAfternoon,
      reason: reasonFor(slot2Type, doctorCode, 'afternoon'),
      createdByEmail: createdBy2,
    });
  }

  const staffByEmail = new Map<string, string>([
    [staff1.email, staff1.id],
    [staff2.email, staff2.id],
  ]);

  let count = 0;

  for (const spec of specs) {
    const patient = patients[spec.patientHn];

    if (!patient) {
      throw new Error(`Seed referenced unknown patient HN: ${spec.patientHn}`);
    }

    const doctor = doctors[spec.doctorCode];

    if (!doctor) {
      throw new Error(`Seed referenced unknown doctor code: ${spec.doctorCode}`);
    }

    const createdByUserId = staffByEmail.get(spec.createdByEmail);

    if (!createdByUserId) {
      throw new Error(
        `Seed referenced unknown creator email: ${spec.createdByEmail}`,
      );
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function requireUser(
  usersByEmail: Record<string, User>,
  email: string,
): User {
  const normalized = normalizeEmail(email);
  const user = usersByEmail[normalized];

  if (!user) {
    throw new Error(`Seed referenced unknown user email: ${email}`);
  }

  return user;
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
