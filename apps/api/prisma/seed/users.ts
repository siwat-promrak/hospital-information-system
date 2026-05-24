/**
 * Seeds non-super-admin users for the post-RBAC schema:
 *   - 2 ADMIN  (clinic managers)
 *   - 2 STAFF  (front-desk operators — added back now that STAFF role exists)
 *   - 5 DOCTOR (1:1 with Doctor rows in doctors.ts; data-only — do not sign in)
 *
 * No PATIENT-role users: patients are pure records in the post-RBAC model
 * and never sign in (no patient portal in P0).
 *
 * Depends on super-admin.ts (for `createdBy`) AND roles.ts (for `roleId`).
 */
import { PrismaClient, type User } from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

import type { SeededRoles } from './roles';

export interface SeededUsers {
  admins: User[];
  staff: User[];
  doctorUsers: User[];
}

interface UserSpec {
  email: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
}

const ADMIN_SPECS: UserSpec[] = [
  {
    email: 'admin1@gmail.com',
    firstNameEn: 'Sarah',
    lastNameEn: 'Smith',
    firstNameTh: null,
    lastNameTh: null,
  },
  {
    email: 'admin2@gmail.com',
    firstNameEn: 'Kanya',
    lastNameEn: 'Ratchaphon',
    firstNameTh: 'กัญญา',
    lastNameTh: 'ราชพล',
  },
];

const STAFF_SPECS: UserSpec[] = [
  {
    email: 'staff1@gmail.com',
    firstNameEn: 'Pim',
    lastNameEn: 'Sukjai',
    firstNameTh: 'พิม',
    lastNameTh: 'สุขใจ',
  },
  {
    email: 'staff2@gmail.com',
    firstNameEn: 'Daniel',
    lastNameEn: 'Park',
    firstNameTh: null,
    lastNameTh: null,
  },
];

const DOCTOR_SPECS: UserSpec[] = [
  {
    email: 'doctor.somchai@gmail.com',
    firstNameEn: 'Somchai',
    lastNameEn: 'Wong',
    firstNameTh: 'สมชาย',
    lastNameTh: 'วงศ์',
  },
  {
    email: 'doctor.alice@gmail.com',
    firstNameEn: 'Alice',
    lastNameEn: 'Adams',
    firstNameTh: null,
    lastNameTh: null,
  },
  {
    email: 'doctor.nattapong@gmail.com',
    firstNameEn: 'Nattapong',
    lastNameEn: 'Srisuk',
    firstNameTh: 'ณัฐพงศ์',
    lastNameTh: 'ศรีสุข',
  },
  {
    email: 'doctor.ben@gmail.com',
    firstNameEn: 'Ben',
    lastNameEn: 'Brown',
    firstNameTh: null,
    lastNameTh: null,
  },
  {
    email: 'doctor.carla@gmail.com',
    firstNameEn: 'Carla',
    lastNameEn: 'Chen',
    firstNameTh: null,
    lastNameTh: null,
  },
];

export async function seedUsers(
  prisma: PrismaClient,
  roles: SeededRoles,
  superAdmin: User,
): Promise<SeededUsers> {
  const admins = await upsertUserSpecs(prisma, ADMIN_SPECS, roles.admin.id, superAdmin);
  const staff = await upsertUserSpecs(prisma, STAFF_SPECS, roles.staff.id, superAdmin);
  const doctorUsers = await upsertUserSpecs(
    prisma,
    DOCTOR_SPECS,
    roles.doctor.id,
    superAdmin,
  );

  return { admins, staff, doctorUsers };
}

async function upsertUserSpecs(
  prisma: PrismaClient,
  specs: UserSpec[],
  roleId: string,
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
        roleId,
      },
      create: {
        email,
        firstNameEn: spec.firstNameEn,
        lastNameEn: spec.lastNameEn,
        firstNameTh: spec.firstNameTh,
        lastNameTh: spec.lastNameTh,
        roleId,
        createdBy: superAdmin.id,
      },
    });

    created.push(user);
  }

  return created;
}
