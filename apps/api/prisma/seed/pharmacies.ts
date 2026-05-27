/**
 * Seeds 19 additional PHARMACY-role users (pharmacy02..pharmacy20)
 * alongside the canonical hand-crafted Mali Saengthong
 * (`pharmacy1@gmail.com`, seeded by `users.ts`). Brings the clinic to a
 * 20-row pharmacy population for pagination + RBAC stress testing.
 *
 * PHARMACY is cross-department in this domain model — every pharmacist
 * is created with `departmentId: null` (mirrors the canonical one).
 *
 * Names come from the shared pool in `_name-pool.ts` at indices
 * 200..218 (reserved range for pharmacy) so no full-name collision is
 * possible with any other seeded role.
 *
 * Idempotent: upsert by email.
 *
 * Depends on roles.ts (PHARMACY role), super-admin.ts (`createdBy`).
 */
import { PrismaClient, type User } from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

import { getUniqueName } from './_name-pool';
import type { SeededRoles } from './roles';

const GENERATED_COUNT = 19;
const FIRST_PHARMACY_NUMBER = 2;
const PHARMACY_NAME_POOL_OFFSET = 200;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export async function seedPharmacies(
  prisma: PrismaClient,
  roles: SeededRoles,
  superAdmin: User,
): Promise<User[]> {
  const created: User[] = [];

  for (let idx = 0; idx < GENERATED_COUNT; idx += 1) {
    const pharmacyNumber = idx + FIRST_PHARMACY_NUMBER;
    const name = getUniqueName(PHARMACY_NAME_POOL_OFFSET + idx);
    const email = normalizeEmail(`pharmacy${pad(pharmacyNumber, 2)}@gmail.com`);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        firstNameEn: name.firstNameEn,
        lastNameEn: name.lastNameEn,
        firstNameTh: name.firstNameTh,
        lastNameTh: name.lastNameTh,
        roleId: roles.pharmacy.id,
        departmentId: null,
      },
      create: {
        email,
        firstNameEn: name.firstNameEn,
        lastNameEn: name.lastNameEn,
        firstNameTh: name.firstNameTh,
        lastNameTh: name.lastNameTh,
        roleId: roles.pharmacy.id,
        departmentId: null,
        createdBy: superAdmin.id,
      },
    });

    created.push(user);
  }

  return created;
}
