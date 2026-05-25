import type { PaginationParams } from '../common/pagination';

/**
 * Service-layer arguments for `listAll`. Only pagination today; future
 * filters (e.g. `?name=`) extend this without changing the call site.
 *
 * Inherits `page` / `pageSize` (including the `PAGE_SIZE_ALL` sentinel
 * support) from the shared `PaginationParams` interface.
 *
 * The row shape returned to the wire is `DepartmentResponseDto`
 * (`./dto/department.response.dto.ts`). The DTO class IS the response type
 * — no parallel TS interface is maintained (Item 6 / Pattern A).
 */
export interface ListDepartmentsArgs extends PaginationParams {}
