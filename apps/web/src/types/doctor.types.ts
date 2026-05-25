/**
 * Doctor response shapes. Mirrors the BE types in
 * `apps/api/src/doctors/doctors.types.ts`. Hand-mirrored — a future
 * `packages/shared` workspace will dedupe.
 *
 * After the RBAC refactor, a doctor has a 1:1 relationship with a
 * department — the previous M:N affiliation array is gone.
 */

export type DoctorGender = "MALE" | "FEMALE";

/**
 * Thin department reference embedded in every doctor row. The BE
 * emits this alongside `departmentId` so the directory can render the
 * department name without a second round-trip.
 */
export interface DoctorDepartmentRef {
  id: string;
  name: string;
}

/**
 * Returned by `GET /doctors`. Carries a single department ref so the
 * directory can group / filter without a second round-trip.
 */
export interface DoctorListRow {
  id: string;
  doctorCode: string;
  firstNameEn: string;
  lastNameEn: string;
  fullName: string;
  gender: DoctorGender | null;
  departmentId: string;
  department: DoctorDepartmentRef;
}

/**
 * Returned by `GET /doctors/:id`. Extends the list row with detail
 * fields and a thin schedule summary (count of active schedules). The
 * full schedule CRUD ships in F06.
 */
export interface DoctorDetailRow extends DoctorListRow {
  phone: string;
  medicalLicenseNo: string;
  address: string | null;
  scheduleCount: number;
}
