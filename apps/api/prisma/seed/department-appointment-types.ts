/**
 * Seeds the per-department `(departmentId, appointmentType)` booking
 * rules. Each row declares that the department offers the category AND
 * carries the per-pair `durationMinutes` + optional booking window
 * (`bookingWindowStartMinute` / `bookingWindowEndMinute`).
 *
 * Depends on departments.ts (to resolve `departmentId` by name) and the
 * super-admin (for the `createdBy` audit column). Idempotent via upsert
 * keyed on the `(departmentId, appointmentType)` unique pair — the
 * `update` block re-applies the rule fields so re-seeding picks up
 * spec changes.
 *
 * F13 overrides (reviewers can spot-check these without grep):
 *  - Orthopedics `PROCEDURE` → 90 min (vs the 60-min default).
 *  - Cardiology `NEW_PATIENT_VISIT` → bookingWindowEndMinute = 660
 *    (= "before 11:00 local" — Asia/Bangkok wall clock).
 */
import {
  AppointmentType,
  PrismaClient,
  type Department,
  type User,
} from '@prisma/client';

/**
 * Per-`AppointmentType` default slot duration (in minutes). Mirrors the
 * pre-F13 global `APPOINTMENT_TYPE_DURATION_MINUTES` const map; per-pair
 * overrides land in `SPECS` below.
 */
const DEFAULT_DURATION_MINUTES: Record<AppointmentType, number> = {
  [AppointmentType.NEW_PATIENT_VISIT]: 30,
  [AppointmentType.FOLLOW_UP]: 15,
  [AppointmentType.CONSULTATION]: 20,
  [AppointmentType.PROCEDURE]: 60,
};

interface AppointmentTypeRuleSpec {
  appointmentType: AppointmentType;
  durationMinutes?: number;
  bookingWindowStartMinute?: number | null;
  bookingWindowEndMinute?: number | null;
}

interface DepartmentTypeSpec {
  departmentName: string;
  rules: AppointmentTypeRuleSpec[];
}

const SPECS: DepartmentTypeSpec[] = [
  {
    departmentName: 'Cardiology',
    rules: [
      {
        appointmentType: AppointmentType.NEW_PATIENT_VISIT,
        // F13 override — confine new-patient visits to before 11:00
        // local (660 min after midnight in CLINIC_TIMEZONE) so the
        // afternoon stays clear for follow-ups.
        bookingWindowEndMinute: 660,
      },
      { appointmentType: AppointmentType.FOLLOW_UP },
      { appointmentType: AppointmentType.CONSULTATION },
      { appointmentType: AppointmentType.PROCEDURE },
    ],
  },
  {
    departmentName: 'Internal Medicine',
    rules: [
      { appointmentType: AppointmentType.NEW_PATIENT_VISIT },
      { appointmentType: AppointmentType.FOLLOW_UP },
      { appointmentType: AppointmentType.CONSULTATION },
    ],
  },
  {
    departmentName: 'Pediatrics',
    rules: [
      { appointmentType: AppointmentType.NEW_PATIENT_VISIT },
      { appointmentType: AppointmentType.FOLLOW_UP },
      { appointmentType: AppointmentType.CONSULTATION },
    ],
  },
  {
    departmentName: 'Orthopedics',
    rules: [
      { appointmentType: AppointmentType.NEW_PATIENT_VISIT },
      { appointmentType: AppointmentType.FOLLOW_UP },
      { appointmentType: AppointmentType.CONSULTATION },
      {
        appointmentType: AppointmentType.PROCEDURE,
        // F13 override — orthopedic procedures need 90 min vs the 60-min
        // global default.
        durationMinutes: 90,
      },
    ],
  },
  {
    departmentName: 'Obstetrics & Gynecology',
    rules: [
      { appointmentType: AppointmentType.NEW_PATIENT_VISIT },
      { appointmentType: AppointmentType.FOLLOW_UP },
      { appointmentType: AppointmentType.CONSULTATION },
      { appointmentType: AppointmentType.PROCEDURE },
    ],
  },
  {
    departmentName: 'Dermatology',
    rules: [
      { appointmentType: AppointmentType.NEW_PATIENT_VISIT },
      { appointmentType: AppointmentType.FOLLOW_UP },
      { appointmentType: AppointmentType.CONSULTATION },
      { appointmentType: AppointmentType.PROCEDURE },
    ],
  },
  {
    departmentName: 'Ophthalmology',
    rules: [
      { appointmentType: AppointmentType.NEW_PATIENT_VISIT },
      { appointmentType: AppointmentType.FOLLOW_UP },
      { appointmentType: AppointmentType.CONSULTATION },
      { appointmentType: AppointmentType.PROCEDURE },
    ],
  },
  {
    departmentName: 'Otolaryngology (ENT)',
    rules: [
      { appointmentType: AppointmentType.NEW_PATIENT_VISIT },
      { appointmentType: AppointmentType.FOLLOW_UP },
      { appointmentType: AppointmentType.CONSULTATION },
      { appointmentType: AppointmentType.PROCEDURE },
    ],
  },
  {
    departmentName: 'General Surgery',
    rules: [
      { appointmentType: AppointmentType.NEW_PATIENT_VISIT },
      { appointmentType: AppointmentType.FOLLOW_UP },
      { appointmentType: AppointmentType.CONSULTATION },
      { appointmentType: AppointmentType.PROCEDURE },
    ],
  },
  {
    departmentName: 'Emergency Medicine',
    rules: [
      { appointmentType: AppointmentType.NEW_PATIENT_VISIT },
      { appointmentType: AppointmentType.FOLLOW_UP },
      { appointmentType: AppointmentType.CONSULTATION },
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

    for (const rule of spec.rules) {
      const durationMinutes =
        rule.durationMinutes ?? DEFAULT_DURATION_MINUTES[rule.appointmentType];
      const bookingWindowStartMinute = rule.bookingWindowStartMinute ?? null;
      const bookingWindowEndMinute = rule.bookingWindowEndMinute ?? null;

      await prisma.departmentAppointmentType.upsert({
        where: {
          departmentId_appointmentType: {
            departmentId: department.id,
            appointmentType: rule.appointmentType,
          },
        },
        update: {
          durationMinutes,
          bookingWindowStartMinute,
          bookingWindowEndMinute,
          updatedBy: superAdmin.id,
        },
        create: {
          departmentId: department.id,
          appointmentType: rule.appointmentType,
          durationMinutes,
          bookingWindowStartMinute,
          bookingWindowEndMinute,
          createdBy: superAdmin.id,
        },
      });

      count += 1;
    }
  }

  return count;
}
