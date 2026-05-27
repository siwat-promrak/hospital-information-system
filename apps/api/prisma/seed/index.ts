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
 * Department-aware ordering: post-refactor `User.departmentId` is NOT
 * NULL for DOCTOR / NURSE rows. Departments are therefore seeded BEFORE
 * `users.ts` (so the NURSE has a department to anchor in) and BEFORE
 * `doctors.ts` (so the per-doctor `departmentId` FK resolves).
 *
 * Totals (after seed):
 *   - 5 roles (ADMIN, DOCTOR, NURSE, MEDICAL_RECORDS_OFFICER, PHARMACY)
 *   - 33 permissions (CRUD-verb catalog: user 4 + role 4 + appointment 9 +
 *     schedule 9 + patient 4 + doctor 1 + medical_records 1 +
 *     doctor_workspace 1; three medical_records mutations removed in F18)
 *   - 48 policies (9 ADMIN + 14 DOCTOR + 14 NURSE +
 *     8 MEDICAL_RECORDS_OFFICER + 3 PHARMACY; F18 removes 2 from DOCTOR +
 *     1 from MRO)
 *   - 225 users — 1 super-admin + 2 ADMIN + 100 NURSE (1 hand-crafted +
 *     99 generated) + 1 MEDICAL_RECORDS_OFFICER + 20 PHARMACY (1 hand-
 *     crafted + 19 generated) + 100 DOCTOR (25 hand-crafted + 75 generated)
 *   - 10 departments
 *   - ~35 department_appointment_types (per-department allowed types)
 *   - 1000 patients (10 hand-crafted + 990 generated)
 *   - 100 doctors each anchored in a single department
 *   - 3600 doctor_schedules across the past 8 + next 4 weeks (12-week window)
 *
 * Appointment + medical_records rows are NOT seeded — they are created via
 * application workflows in later features.
 */
import { PrismaClient } from '@prisma/client';

import { seedDepartmentAppointmentTypes } from './department-appointment-types';
import { seedDepartments } from './departments';
import { seedDoctorSchedules } from './doctor-schedules';
import { seedDoctors } from './doctors';
import { seedNurses } from './nurses';
import { seedPatients } from './patients';
import { seedPermissions } from './permissions';
import { seedPharmacies } from './pharmacies';
import { seedPolicies } from './policies';
import { seedRoles } from './roles';
import { assignSuperAdminRole, seedSuperAdmin } from './super-admin';
import { seedUsers } from './users';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const superAdmin = await seedSuperAdmin(prisma);
  const roles = await seedRoles(prisma, superAdmin);
  const permissions = await seedPermissions(prisma);
  const policyCount = await seedPolicies(prisma, roles, permissions, superAdmin);
  await assignSuperAdminRole(prisma, roles.admin);

  // Departments first so scoped users (NURSE) and doctors have a
  // departmentId to anchor in.
  const departments = await seedDepartments(prisma, superAdmin);
  const users = await seedUsers(prisma, roles, departments, superAdmin);
  const generatedNurses = await seedNurses(prisma, roles, departments, superAdmin);
  const generatedPharmacies = await seedPharmacies(prisma, roles, superAdmin);
  const departmentAppointmentTypeCount = await seedDepartmentAppointmentTypes(
    prisma,
    departments,
    superAdmin,
  );
  const patients = await seedPatients(prisma, superAdmin);
  const seededDoctors = await seedDoctors(prisma, roles, departments, superAdmin);
  const scheduleCount = await seedDoctorSchedules(prisma, seededDoctors.doctors, superAdmin);

  // eslint-disable-next-line no-console
  console.log('Seed complete.', {
    roles: 5,
    permissions: 33,
    policies: policyCount,
    users:
      1 + // super-admin
      users.admins.length +
      1 + // NURSE (hand-crafted)
      generatedNurses.length +
      1 + // MEDICAL_RECORDS_OFFICER
      1 + // PHARMACY (hand-crafted)
      generatedPharmacies.length +
      seededDoctors.users.length,
    departments: departments.length,
    departmentAppointmentTypes: departmentAppointmentTypeCount,
    patients: patients.length,
    doctors: seededDoctors.doctors.length,
    doctorSchedules: scheduleCount,
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
