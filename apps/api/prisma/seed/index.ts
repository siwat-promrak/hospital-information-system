/**
 * Dev seed orchestrator for the Hospital Information System.
 *
 * Each entity is seeded by a dedicated module under prisma/seed/ so the
 * seed data is easy to scan one table at a time. Every seeder is
 * idempotent (upsert by natural key) so re-running the seed leaves the DB
 * in the same shape rather than duplicating rows.
 *
 * Bootstrap rule: the **super-admin** user (nil UUID) MUST run first
 * because every other seeded row's `created_by` column references its
 * id. The remaining order respects FK dependencies (departments before
 * doctors, doctors before schedules, users before patients, etc.).
 *
 * Totals (after seed):
 *   - 18 users — 1 super-admin + 2 ADMIN + 5 DOCTOR + 10 PATIENT
 *   - 3 departments
 *   - 5 doctors (2 / 2 / 1 across departments)
 *   - 25 doctor schedules (MON-FRI per doctor)
 *   - 10 patients (5 MALE + 5 FEMALE)
 *   - 10 appointments (2 per doctor; mix of FOLLOW_UP / CONSULTATION /
 *     PROCEDURE; createdBy alternates between admin1 and admin2)
 */
import { PrismaClient } from '@prisma/client';

import { seedAppointments } from './appointments';
import { seedDepartments } from './departments';
import { seedDoctorSchedules } from './doctor-schedules';
import { seedDoctors } from './doctors';
import { seedPatients } from './patients';
import { seedSuperAdmin } from './super-admin';
import { seedUsers } from './users';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const superAdmin = await seedSuperAdmin(prisma);
  const users = await seedUsers(prisma, superAdmin);
  const departments = await seedDepartments(prisma, superAdmin);
  const doctors = await seedDoctors(
    prisma,
    users.doctorUsers,
    departments,
    superAdmin,
  );
  await seedDoctorSchedules(prisma, doctors, superAdmin);
  const patients = await seedPatients(prisma, users.patientUsers, superAdmin);
  const appointmentCount = await seedAppointments(
    prisma,
    doctors,
    patients,
    users.admins,
  );

  // eslint-disable-next-line no-console
  console.log('Seed complete.', {
    users:
      1 + users.admins.length + users.doctorUsers.length + users.patientUsers.length,
    departments: departments.length,
    doctors: doctors.length,
    doctorSchedules: doctors.length * 5,
    patients: patients.length,
    appointments: appointmentCount,
  });
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
