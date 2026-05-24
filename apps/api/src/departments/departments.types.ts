/**
 * Shape returned by the departments resource. Both the list and detail
 * endpoints return the same row (no nested affiliations on the department
 * itself — affiliations live under `/departments/:id/doctors`).
 */
export interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Shape returned by `GET /departments/:id/doctors`. A flattened row per
 * doctor in the department, including the doctor's medical metadata and
 * the `isPrimary` flag from the `doctor_departments` join row.
 */
export interface DepartmentDoctorRow {
  id: string;
  doctorCode: string;
  fullName: string;
  isPrimary: boolean;
}

/**
 * Service-layer arguments for `listAll`. Only pagination today; future
 * filters (e.g. `?name=`) extend this without changing the call site.
 */
export interface ListDepartmentsArgs {
  page?: number;
  pageSize?: number;
}

/**
 * Service-layer arguments for `listDoctorsForDepartment`. Pagination only.
 */
export interface ListDepartmentDoctorsArgs {
  page?: number;
  pageSize?: number;
}
