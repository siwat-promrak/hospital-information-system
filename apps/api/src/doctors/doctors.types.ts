import type { Gender } from '@prisma/client';

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
 * Row returned by `GET /doctors`. Includes the affiliation list so the
 * staff directory can group / filter without a second round-trip.
 */
export interface DoctorListRow {
  id: string;
  doctorCode: string;
  firstNameEn: string;
  lastNameEn: string;
  fullName: string;
  gender: Gender | null;
  departments: DoctorDepartmentAffiliation[];
}

/**
 * Row returned by `GET /doctors/:id`. Extends the list row with the doctor
 * detail fields and a thin schedule summary (count of active schedules).
 * The schedule editor (F06) will surface the full detail; here we just
 * preview existence.
 */
export interface DoctorDetailRow extends DoctorListRow {
  phone: string;
  medicalLicenseNo: string;
  address: string | null;
  scheduleCount: number;
}

/**
 * Service-layer arguments for `listAll`. Pagination + the existing
 * department filter; new filters (search, role, …) extend this without
 * changing the controller wiring.
 */
export interface ListDoctorsArgs {
  page?: number;
  pageSize?: number;
  departmentId?: string;
}
