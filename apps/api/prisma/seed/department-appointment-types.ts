/**
 * Seeds the per-department `(departmentId, appointmentType)` booking
 * rules. Each row declares that the department offers the category AND
 * carries the per-pair `durationMinutes` + optional booking windows
 * (F21 — child table `department_appointment_type_windows`).
 *
 * Depends on departments.ts (to resolve `departmentId` by name) and the
 * super-admin (for the `createdBy` audit column). Idempotent via upsert
 * keyed on the `(departmentId, appointmentType)` unique pair — the
 * `update` block re-applies the rule fields so re-seeding picks up
 * spec changes. Windows are deleted and re-inserted on each seed run so
 * multi-range specs stay current.
 *
 * F13/F21 overrides (reviewers can spot-check these without grep):
 *  - Orthopedics `PROCEDURE` → 90 min (vs the 60-min default).
 *  - Cardiology `NEW_PATIENT_VISIT` → single window [0, 660) = before
 *    11:00 local (migrated from the F13 bookingWindowEndMinute column).
 *  - Internal Medicine `CONSULTATION` → multi-range [540, 660) ∪
 *    [840, 960) = 09:00–11:00 OR 14:00–16:00 local (genuinely multi-range
 *    pair required by F21 spec / US-21.3).
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

interface BookingWindowSpec {
  startMinute: number;
  endMinute: number;
}

interface AppointmentTypeRuleSpec {
  appointmentType: AppointmentType;
  durationMinutes?: number;
  bookingWindows?: BookingWindowSpec[];
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
        // F21 migration of the F13 single-window override — confine
        // new-patient visits to before 11:00 local (660 min after
        // midnight in CLINIC_TIMEZONE).  Converted from the old
        // bookingWindowEndMinute=660 (both-NULL start → 0).
        bookingWindows: [{ startMinute: 0, endMinute: 660 }],
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
      {
        appointmentType: AppointmentType.CONSULTATION,
        // F21 genuinely multi-range pair (US-21.3) — 09:00–11:00 OR
        // 14:00–16:00 local (Asia/Bangkok), leaving a midday gap.
        //  09:00 local = 540 min; 11:00 local = 660 min.
        //  14:00 local = 840 min; 16:00 local = 960 min.
        bookingWindows: [
          { startMinute: 540, endMinute: 660 },
          { startMinute: 840, endMinute: 960 },
        ],
      },
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
      const bookingWindows = rule.bookingWindows ?? [];

      // Upsert the parent row.
      const dat = await prisma.departmentAppointmentType.upsert({
        where: {
          departmentId_appointmentType: {
            departmentId: department.id,
            appointmentType: rule.appointmentType,
          },
        },
        update: {
          durationMinutes,
          updatedBy: superAdmin.id,
        },
        create: {
          departmentId: department.id,
          appointmentType: rule.appointmentType,
          durationMinutes,
          createdBy: superAdmin.id,
        },
        select: { id: true },
      });

      // Replace all window rows for this pair (delete + recreate is safe
      // at seed time — no FK references from other tables point at windows).
      await prisma.departmentAppointmentTypeWindow.deleteMany({
        where: { departmentAppointmentTypeId: dat.id },
      });

      for (const win of bookingWindows) {
        await prisma.departmentAppointmentTypeWindow.create({
          data: {
            departmentAppointmentTypeId: dat.id,
            startMinute: win.startMinute,
            endMinute: win.endMinute,
            createdBy: superAdmin.id,
          },
        });
      }

      count += 1;
    }
  }

  return count;
}
