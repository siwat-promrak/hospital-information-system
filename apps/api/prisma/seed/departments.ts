/**
 * Seeds the three clinical departments referenced by doctors.ts and
 * appointments.ts. Depends on the super-admin seeded in super-admin.ts so
 * the shared `createdBy` audit column has a valid referent. Natural key is
 * `name` (unique in the schema), used by downstream seeders to look up
 * department ids.
 */
import { PrismaClient, type Department, type User } from '@prisma/client';

interface DepartmentSpec {
  name: string;
  description: string;
}

const SPECS: DepartmentSpec[] = [
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

export async function seedDepartments(
  prisma: PrismaClient,
  superAdmin: User,
): Promise<Department[]> {
  const created: Department[] = [];

  for (const spec of SPECS) {
    const department = await prisma.department.upsert({
      where: { name: spec.name },
      update: { description: spec.description },
      create: {
        name: spec.name,
        description: spec.description,
        createdBy: superAdmin.id,
      },
    });

    created.push(department);
  }

  return created;
}
