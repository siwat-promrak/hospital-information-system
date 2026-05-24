/**
 * Dev seed orchestrator for the Hospital Information System.
 *
 * Each entity is seeded by a dedicated module under prisma/seed/ so the
 * seed data is easy to scan one table at a time. Every seeder is
 * idempotent (upsert by natural key) so re-running the seed leaves the DB
 * in the same shape rather than duplicating rows.
 *
 * RBAC bootstrap (Option C): `roles.created_by` FKs to `users.id` and
 * `users.role_id` FKs to `roles.id`. Neither side can exist first, so:
 *   1. Insert the super-admin user with `role_id = NULL` (the schema
 *      allows it for the bootstrap).
 *   2. Seed roles / permissions / policies — all using super-admin.id as
 *      `created_by`.
 *   3. Back-fill the super-admin's `role_id` with the ADMIN role id via
 *      `assignSuperAdminRole`.
 * After bootstrap, every subsequent user is created with a non-null
 * `role_id`; DTO validation at the API layer enforces this.
 *
 * Totals (after seed):
 *   - 3 roles (ADMIN, STAFF, DOCTOR)
 *   - 15 permissions
 *   - 26 policies (15 ADMIN + 11 STAFF + 0 DOCTOR)
 *   - 10 users — 1 super-admin + 2 ADMIN + 2 STAFF + 5 DOCTOR
 *   - 10 departments
 *   - ~34 department_appointment_types (per-department allowed types)
 *   - 5 doctors (2 / 2 / 1 across departments)
 *   - 25 doctor schedules (MON-FRI per doctor)
 *   - 10 patients (5 MALE + 5 FEMALE)
 *   - 10 appointments — `createdBy` rotates admin1 → admin2 → staff1 → staff2
 */
import { PrismaClient } from '@prisma/client';

import { seedAppointments } from './appointments';
import { seedDepartmentAppointmentTypes } from './department-appointment-types';
import { seedDepartments } from './departments';
import { seedDoctorSchedules } from './doctor-schedules';
import { seedDoctors } from './doctors';
import { seedPatients } from './patients';
import { seedPermissions } from './permissions';
import { seedPolicies } from './policies';
import { seedRoles } from './roles';
import { assignSuperAdminRole, seedSuperAdmin } from './super-admin';
import { seedUsers } from './users';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const superAdmin = await seedSuperAdmin(prisma);
  const roles = await seedRoles(prisma, superAdmin);
  const permissions = await seedPermissions(prisma, superAdmin);
  const policyCount = await seedPolicies(prisma, roles, permissions, superAdmin);
  await assignSuperAdminRole(prisma, roles.admin);

  const users = await seedUsers(prisma, roles, superAdmin);
  const departments = await seedDepartments(prisma, superAdmin);
  const departmentAppointmentTypeCount = await seedDepartmentAppointmentTypes(
    prisma,
    departments,
    superAdmin,
  );
  const doctors = await seedDoctors(
    prisma,
    users.doctorUsers,
    departments,
    superAdmin,
  );
  await seedDoctorSchedules(prisma, doctors, superAdmin);
  const patients = await seedPatients(prisma, superAdmin);
  const appointmentCount = await seedAppointments(
    prisma,
    doctors,
    patients,
    users.admins,
    users.staff,
  );

  // eslint-disable-next-line no-console
  console.log('Seed complete.', {
    roles: 3,
    permissions: 15,
    policies: policyCount,
    users:
      1 + users.admins.length + users.staff.length + users.doctorUsers.length,
    departments: departments.length,
    departmentAppointmentTypes: departmentAppointmentTypeCount,
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
