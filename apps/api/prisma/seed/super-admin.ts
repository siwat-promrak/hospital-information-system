/**
 * Seeds the super-admin User at the nil UUID. Must run first because every
 * other seeded row's `created_by` references this id. The super-admin's own
 * `created_by` self-references its own id — Postgres allows the single-row
 * INSERT because the FK check fires at end of statement.
 */
import { PrismaClient, Role, type User } from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

export const SUPER_ADMIN_ID = '00000000-0000-0000-0000-000000000000';

export async function seedSuperAdmin(prisma: PrismaClient): Promise<User> {
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
