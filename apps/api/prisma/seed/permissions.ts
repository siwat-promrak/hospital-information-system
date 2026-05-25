/**
 * Seeds the 35-row atomic permission catalog declared in
 * `src/auth/permissions.ts`. Adding a permission is a single-file edit in
 * the catalog; the seed re-runs idempotently against the unique `code`.
 *
 * The `permissions` table is catalog-only (no admin runtime CRUD), so the
 * seeder writes only `code` + `description` — no audit columns.
 *
 * Returned as a `Record<code, Permission>` so the policies seeder can look
 * up ids by stable string handle.
 */
import { PrismaClient, type Permission } from '@prisma/client';

import { PERMISSION_CATALOG } from '../../src/auth/permissions';

export type PermissionMap = Record<string, Permission>;

export async function seedPermissions(prisma: PrismaClient): Promise<PermissionMap> {
  const map: PermissionMap = {};

  for (const spec of PERMISSION_CATALOG) {
    const permission = await prisma.permission.upsert({
      where: { code: spec.code },
      update: { description: spec.description },
      create: {
        code: spec.code,
        description: spec.description,
      },
    });

    map[permission.code] = permission;
  }

  return map;
}
