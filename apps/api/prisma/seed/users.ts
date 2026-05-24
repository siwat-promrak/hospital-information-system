/**
 * Seeds non-super-admin users: 2 ADMIN (clinic operators), 5 DOCTOR (1:1
 * with Doctor rows in doctors.ts), 10 PATIENT (1:1 with Patient rows in
 * patients.ts). Depends on the super-admin seeded in super-admin.ts so the
 * shared `createdBy` audit column has a valid referent.
 */
import { PrismaClient, Role, type User } from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

export interface SeededUsers {
  admins: User[];
  doctorUsers: User[];
  patientUsers: User[];
}

interface UserSpec {
  email: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
  role: Role;
}

const ADMIN_SPECS: UserSpec[] = [
  {
    email: 'admin1@gmail.com',
    firstNameEn: 'Sarah',
    lastNameEn: 'Smith',
    firstNameTh: null,
    lastNameTh: null,
    role: Role.ADMIN,
  },
  {
    email: 'admin2@gmail.com',
    firstNameEn: 'Kanya',
    lastNameEn: 'Ratchaphon',
    firstNameTh: 'กัญญา',
    lastNameTh: 'ราชพล',
    role: Role.ADMIN,
  },
];

const DOCTOR_SPECS: UserSpec[] = [
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
];

const PATIENT_SPECS: UserSpec[] = [
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

export async function seedUsers(
  prisma: PrismaClient,
  superAdmin: User,
): Promise<SeededUsers> {
  const admins = await upsertUserSpecs(prisma, ADMIN_SPECS, superAdmin);
  const doctorUsers = await upsertUserSpecs(prisma, DOCTOR_SPECS, superAdmin);
  const patientUsers = await upsertUserSpecs(prisma, PATIENT_SPECS, superAdmin);

  return { admins, doctorUsers, patientUsers };
}

async function upsertUserSpecs(
  prisma: PrismaClient,
  specs: UserSpec[],
  superAdmin: User,
): Promise<User[]> {
  const created: User[] = [];

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

    created.push(user);
  }

  return created;
}
