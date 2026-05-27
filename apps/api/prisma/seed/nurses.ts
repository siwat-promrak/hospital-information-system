/**
 * Seeds 99 additional NURSE-role users (nurse02..nurse100) alongside the
 * canonical hand-crafted nurse Pim Sukjai (`nurse1@gmail.com`, seeded by
 * `users.ts`). Brings the clinic to a realistic ~100 nurse population.
 *
 * Each nurse is anchored in a department, rotating through the 10
 * seeded departments so the floor staff is spread evenly (~10 nurses
 * per department).
 *
 * Names come from the shared pool in `_name-pool.ts` at indices
 * 100..198 (reserved range for nurses) so no full-name collision is
 * possible with any other seeded role.
 *
 * Idempotent: upsert by email.
 *
 * Depends on roles.ts (NURSE role), departments.ts (anchoring),
 * super-admin.ts (`createdBy`).
 */
import { PrismaClient, type Department, type User } from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

import { getUniqueName } from './_name-pool';
import type { SeededRoles } from './roles';

const GENERATED_COUNT = 99;
const FIRST_NURSE_NUMBER = 2;
const NURSE_NAME_POOL_OFFSET = 100;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export async function seedNurses(
  prisma: PrismaClient,
  roles: SeededRoles,
  departments: Department[],
  superAdmin: User,
): Promise<User[]> {
  if (departments.length === 0) {
    throw new Error('seedNurses: at least one Department must exist before seeding nurses');
  }

  const created: User[] = [];

  for (let idx = 0; idx < GENERATED_COUNT; idx += 1) {
    const nurseNumber = idx + FIRST_NURSE_NUMBER;
    const name = getUniqueName(NURSE_NAME_POOL_OFFSET + idx);
    const department = departments[idx % departments.length]!;
    const email = normalizeEmail(`nurse${pad(nurseNumber, 2)}@gmail.com`);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        firstNameEn: name.firstNameEn,
        lastNameEn: name.lastNameEn,
        firstNameTh: name.firstNameTh,
        lastNameTh: name.lastNameTh,
        roleId: roles.nurse.id,
        departmentId: department.id,
      },
      create: {
        email,
        firstNameEn: name.firstNameEn,
        lastNameEn: name.lastNameEn,
        firstNameTh: name.firstNameTh,
        lastNameTh: name.lastNameTh,
        roleId: roles.nurse.id,
        departmentId: department.id,
        createdBy: superAdmin.id,
      },
    });

    created.push(user);
  }

  return created;
}
