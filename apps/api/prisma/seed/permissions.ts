/**
 * Seeds the 16 atomic permission rows from the canonical catalog declared in
 * `src/auth/permissions.ts`. Adding a permission is a single-file edit in
 * the catalog; the seed re-runs idempotently against the unique `code`.
 *
 * Returned as a `Record<code, Permission>` so the policies seeder can look
 * up ids by stable string handle.
 */
import { PrismaClient, type Permission, type User } from '@prisma/client';

import { PERMISSION_CATALOG } from '../../src/auth/permissions';

export type PermissionMap = Record<string, Permission>;

export async function seedPermissions(
  prisma: PrismaClient,
  superAdmin: User,
): Promise<PermissionMap> {
  const map: PermissionMap = {};

  for (const spec of PERMISSION_CATALOG) {
    const permission = await prisma.permission.upsert({
      where: { code: spec.code },
      update: { description: spec.description },
      create: {
        code: spec.code,
        description: spec.description,
        createdBy: superAdmin.id,
      },
    });

    map[permission.code] = permission;
  }

  return map;
}
