/**
 * Seeds non-super-admin, non-doctor users for the post-RBAC schema:
 *   - 2 ADMIN                   (clinic managers)
 *   - 1 NURSE                   (department-scoped front-desk; lives in the
 *                                FIRST seeded department so the e2e flow has
 *                                a department to target).
 *   - 1 MEDICAL_RECORDS_OFFICER (cross-department, departmentId = null)
 *   - 1 PHARMACY                (cross-department, departmentId = null)
 *
 * No DOCTOR-role users are seeded here — `doctors.ts` mints those alongside
 * the matching `Doctor` row. No PATIENT users either — patients are pure
 * records and never sign in (no patient portal in P0).
 *
 * Depends on super-admin.ts (for `createdBy`), roles.ts (for `roleId`), and
 * departments.ts (for the NURSE's `departmentId`).
 */
import { PrismaClient, type Department, type User } from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

import type { SeededRoles } from './roles';

export interface SeededUsers {
  admins: User[];
  nurse: User;
  medicalRecordsOfficer: User;
  pharmacy: User;
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

const NURSE_SPEC: UserSpec = {
  email: 'nurse1@gmail.com',
  firstNameEn: 'Pim',
  lastNameEn: 'Sukjai',
  firstNameTh: 'พิม',
  lastNameTh: 'สุขใจ',
};

const MEDICAL_RECORDS_OFFICER_SPEC: UserSpec = {
  email: 'records1@gmail.com',
  firstNameEn: 'Daniel',
  lastNameEn: 'Park',
  firstNameTh: null,
  lastNameTh: null,
};

const PHARMACY_SPEC: UserSpec = {
  email: 'pharmacy1@gmail.com',
  firstNameEn: 'Mali',
  lastNameEn: 'Saengthong',
  firstNameTh: 'มะลิ',
  lastNameTh: 'แสงทอง',
};

export async function seedUsers(
  prisma: PrismaClient,
  roles: SeededRoles,
  departments: Department[],
  superAdmin: User,
): Promise<SeededUsers> {
  const admins = await upsertUserSpecs(prisma, ADMIN_SPECS, {
    roleId: roles.admin.id,
    departmentId: null,
    superAdmin,
  });

  const nurseDepartment = departments[0];

  if (!nurseDepartment) {
    throw new Error('seedUsers: at least one Department must exist before seeding the NURSE user');
  }

  const [nurse] = await upsertUserSpecs(prisma, [NURSE_SPEC], {
    roleId: roles.nurse.id,
    departmentId: nurseDepartment.id,
    superAdmin,
  });
  const [medicalRecordsOfficer] = await upsertUserSpecs(
    prisma,
    [MEDICAL_RECORDS_OFFICER_SPEC],
    {
      roleId: roles.medicalRecordsOfficer.id,
      departmentId: null,
      superAdmin,
    },
  );
  const [pharmacy] = await upsertUserSpecs(prisma, [PHARMACY_SPEC], {
    roleId: roles.pharmacy.id,
    departmentId: null,
    superAdmin,
  });

  if (!nurse || !medicalRecordsOfficer || !pharmacy) {
    throw new Error('seedUsers: failed to upsert one of NURSE / MEDICAL_RECORDS_OFFICER / PHARMACY');
  }

  return { admins, nurse, medicalRecordsOfficer, pharmacy };
}

interface UpsertContext {
  roleId: string;
  departmentId: string | null;
  superAdmin: User;
}

async function upsertUserSpecs(
  prisma: PrismaClient,
  specs: UserSpec[],
  ctx: UpsertContext,
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
        roleId: ctx.roleId,
        departmentId: ctx.departmentId,
      },
      create: {
        email,
        firstNameEn: spec.firstNameEn,
        lastNameEn: spec.lastNameEn,
        firstNameTh: spec.firstNameTh,
        lastNameTh: spec.lastNameTh,
        roleId: ctx.roleId,
        departmentId: ctx.departmentId,
        createdBy: ctx.superAdmin.id,
      },
    });

    created.push(user);
  }

  return created;
}
