/**
 * Seeds the per-department allowed `AppointmentType` set. Each
 * `(departmentId, appointmentType)` row declares that the department
 * offers that category of appointment; appointment creation must check
 * the pair exists here before booking.
 *
 * Depends on departments.ts (to resolve `departmentId` by name) and the
 * super-admin (for the `createdBy` audit column). Idempotent via upsert
 * keyed on the `(departmentId, appointmentType)` unique pair.
 */
import {
  AppointmentType,
  PrismaClient,
  type Department,
  type User,
} from '@prisma/client';

interface DepartmentTypeSpec {
  departmentName: string;
  appointmentTypes: AppointmentType[];
}

const SPECS: DepartmentTypeSpec[] = [
  {
    departmentName: 'Cardiology',
    appointmentTypes: [
      AppointmentType.NEW_PATIENT_VISIT,
      AppointmentType.FOLLOW_UP,
      AppointmentType.CONSULTATION,
      AppointmentType.PROCEDURE,
    ],
  },
  {
    departmentName: 'Internal Medicine',
    appointmentTypes: [
      AppointmentType.NEW_PATIENT_VISIT,
      AppointmentType.FOLLOW_UP,
      AppointmentType.CONSULTATION,
    ],
  },
  {
    departmentName: 'Pediatrics',
    appointmentTypes: [
      AppointmentType.NEW_PATIENT_VISIT,
      AppointmentType.FOLLOW_UP,
      AppointmentType.CONSULTATION,
    ],
  },
  {
    departmentName: 'Orthopedics',
    appointmentTypes: [
      AppointmentType.NEW_PATIENT_VISIT,
      AppointmentType.FOLLOW_UP,
      AppointmentType.CONSULTATION,
      AppointmentType.PROCEDURE,
    ],
  },
  {
    departmentName: 'Obstetrics & Gynecology',
    appointmentTypes: [
      AppointmentType.NEW_PATIENT_VISIT,
      AppointmentType.FOLLOW_UP,
      AppointmentType.CONSULTATION,
      AppointmentType.PROCEDURE,
    ],
  },
  {
    departmentName: 'Dermatology',
    appointmentTypes: [
      AppointmentType.NEW_PATIENT_VISIT,
      AppointmentType.FOLLOW_UP,
      AppointmentType.CONSULTATION,
      AppointmentType.PROCEDURE,
    ],
  },
  {
    departmentName: 'Ophthalmology',
    appointmentTypes: [
      AppointmentType.NEW_PATIENT_VISIT,
      AppointmentType.FOLLOW_UP,
      AppointmentType.CONSULTATION,
      AppointmentType.PROCEDURE,
    ],
  },
  {
    departmentName: 'Otolaryngology (ENT)',
    appointmentTypes: [
      AppointmentType.NEW_PATIENT_VISIT,
      AppointmentType.FOLLOW_UP,
      AppointmentType.CONSULTATION,
      AppointmentType.PROCEDURE,
    ],
  },
  {
    departmentName: 'General Surgery',
    appointmentTypes: [
      AppointmentType.NEW_PATIENT_VISIT,
      AppointmentType.CONSULTATION,
      AppointmentType.PROCEDURE,
    ],
  },
  {
    departmentName: 'Emergency Medicine',
    appointmentTypes: [
      AppointmentType.NEW_PATIENT_VISIT,
      AppointmentType.CONSULTATION,
    ],
  },
];

export async function seedDepartmentAppointmentTypes(
  prisma: PrismaClient,
  departments: Department[],
  superAdmin: User,
): Promise<number> {
  const departmentsByName = new Map(departments.map((d) => [d.name, d]));

  let count = 0;

  for (const spec of SPECS) {
    const department = departmentsByName.get(spec.departmentName);

    if (!department) {
      throw new Error(
        `seedDepartmentAppointmentTypes: unknown department "${spec.departmentName}"`,
      );
    }

    for (const appointmentType of spec.appointmentTypes) {
      await prisma.departmentAppointmentType.upsert({
        where: {
          departmentId_appointmentType: {
            departmentId: department.id,
            appointmentType,
          },
        },
        update: {},
        create: {
          departmentId: department.id,
          appointmentType,
          createdBy: superAdmin.id,
        },
      });

      count += 1;
    }
  }

  return count;
}
