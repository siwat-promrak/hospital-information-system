/**
 * Doctor response shapes. Mirrors the BE types in
 * `apps/api/src/doctors/doctors.types.ts`. Hand-mirrored — a future
 * `packages/shared` workspace will dedupe.
 */

export type DoctorGender = "MALE" | "FEMALE";

/**
 * Per-department affiliation embedded in every doctor row. A doctor may
 * appear under multiple departments — the FE renders one chip per entry.
 */
export interface DoctorDepartmentAffiliation {
  departmentId: string;
  departmentName: string;
  isPrimary: boolean;
}

/**
 * Returned by `GET /doctors`. Includes the affiliation list so the staff
 * directory can group / filter without a second round-trip.
 */
export interface DoctorListRow {
  id: string;
  doctorCode: string;
  firstNameEn: string;
  lastNameEn: string;
  fullName: string;
  gender: DoctorGender | null;
  departments: DoctorDepartmentAffiliation[];
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
