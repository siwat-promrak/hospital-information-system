/**
 * Department response shapes. Mirrors the BE types in
 * `apps/api/src/departments/departments.types.ts`. Hand-mirrored — a
 * future `packages/shared` workspace will dedupe.
 */

/** Returned by `GET /departments`. */
export interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Returned by `GET /departments/:id/doctors`. Flat per-doctor row with
 * the `isPrimary` flag hoisted from the `doctor_departments` join.
 */
export interface DepartmentDoctorRow {
  id: string;
  doctorCode: string;
  fullName: string;
  isPrimary: boolean;
}
