import type { PaginationParams } from '../common/pagination';

/**
 * Service-layer arguments for `listAll`. Pagination + the existing
 * department filter; new filters (search, role, …) extend this without
 * changing the controller wiring.
 *
 * Inherits `page` / `pageSize` (including the `PAGE_SIZE_ALL` sentinel
 * support) from the shared `PaginationParams` interface.
 *
 * Row shapes returned to the wire are `DoctorResponseDto` (list) and
 * `DoctorDetailResponseDto` (detail) — see `./dto/doctor.response.dto.ts`.
 * The DTO classes ARE the response types; no parallel TS interfaces are
 * maintained (Item 6 / Pattern A).
 */
export interface ListDoctorsArgs extends PaginationParams {
  departmentId?: string;
  /**
   * Optional case-insensitive substring filter. Matched against
   * `User.firstNameEn`, `User.lastNameEn`, `User.firstNameTh`,
   * `User.lastNameTh` and `Doctor.doctorCode` (logical OR). The controller
   * trims whitespace and normalises empty strings to `undefined`, so a
   * defined value here is always a non-empty trimmed string.
   */
  q?: string;
}
