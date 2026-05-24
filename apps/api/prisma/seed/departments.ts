/**
 * Seeds the 10 clinical departments. Depends on the super-admin seeded in
 * super-admin.ts so the shared `createdBy` audit column has a valid
 * referent. Natural key is `name` (unique in the schema), used by
 * downstream seeders (e.g. department-appointment-types.ts) to look up
 * department ids.
 *
 * English names only for P0; Thai translations move to F12 (i18n).
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
  {
    name: 'Orthopedics',
    description: 'Musculoskeletal injuries, joints, and orthopedic surgery.',
  },
  {
    name: 'Obstetrics & Gynecology',
    description: 'Pregnancy, childbirth, and female reproductive health.',
  },
  {
    name: 'Dermatology',
    description: 'Skin, hair, and nail conditions including minor procedures.',
  },
  {
    name: 'Ophthalmology',
    description: 'Eye care, vision correction, and ophthalmic surgery.',
  },
  {
    name: 'Otolaryngology (ENT)',
    description: 'Ear, nose, throat, and head-and-neck disorders.',
  },
  {
    name: 'General Surgery',
    description: 'Abdominal, soft-tissue, and general surgical procedures.',
  },
  {
    name: 'Emergency Medicine',
    description: 'Acute and urgent care for walk-in emergencies.',
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
