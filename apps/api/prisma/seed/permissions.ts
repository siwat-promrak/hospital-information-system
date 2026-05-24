/**
 * Seeds the 16 atomic permission rows from the canonical `PERMISSIONS`
 * const map. Permissions are CODE-DEFINED — adding a new one requires a
 * code change here AND a new policy seed in `policies.ts`. The DB table
 * exists so role↔permission mappings (policies) can be edited at runtime
 * by admins holding `permission.assign`.
 *
 * Returned as a `Record<code, Permission>` so the policies seeder can look
 * up ids by stable string handle.
 */
import { PrismaClient, type Permission, type User } from '@prisma/client';

export interface PermissionSpec {
  code: string;
  description: string;
}

export const PERMISSIONS: PermissionSpec[] = [
  {
    code: 'appointment.create',
    description: 'Create new appointments for any patient',
  },
  { code: 'appointment.cancel', description: 'Cancel any appointment' },
  { code: 'appointment.list', description: 'List all appointments with filters' },
  { code: 'appointment.read', description: 'View an appointment’s detail' },
  {
    code: 'schedule.manage',
    description: 'Create / update / delete doctor schedules',
  },
  { code: 'patient.create', description: 'Register new patients (walk-in)' },
  { code: 'patient.read', description: 'View patient details' },
  { code: 'patient.update', description: 'Edit patient demographics' },
  { code: 'patient.list', description: 'List all patients' },
  { code: 'doctor.read', description: 'View doctor details' },
  { code: 'doctor.list', description: 'List doctors and departments' },
  {
    code: 'user.invite',
    description: 'Pre-create a User row by email + role',
  },
  { code: 'user.disable', description: 'Soft-delete a User (block sign-in)' },
  { code: 'user.list', description: 'List all Users' },
  { code: 'role.manage', description: 'Create / update / delete / list roles' },
  {
    code: 'permission.assign',
    description: 'Create / delete policies (assign permissions to roles)',
  },
];

export type PermissionMap = Record<string, Permission>;

export async function seedPermissions(
  prisma: PrismaClient,
  superAdmin: User,
): Promise<PermissionMap> {
  const map: PermissionMap = {};

  for (const spec of PERMISSIONS) {
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
