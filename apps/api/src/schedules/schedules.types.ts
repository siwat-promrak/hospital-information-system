import type { PaginationParams } from '../common/pagination';

/**
 * Service-layer arguments for `listSchedules`. Pagination + the filter
 * axes (doctor, department, date range). `from` / `to` are ISO date
 * strings (`YYYY-MM-DD`) — the service expands them to start-of-day /
 * end-of-day UTC bounds.
 *
 * Inherits `page` / `pageSize` (including the `PAGE_SIZE_ALL` sentinel
 * the calendar uses to fetch a whole `from` / `to` window in one round-
 * trip) from the shared `PaginationParams` interface.
 *
 * Note: the row shape returned to the wire is `ScheduleResponseDto`
 * (`./dto/schedule.response.dto.ts`). The DTO class IS the response type
 * — no parallel TS interface is maintained (Item 6 / Pattern A).
 */
export interface ListSchedulesArgs extends PaginationParams {
  doctorId?: string;
  departmentId?: string;
  from?: string;
  to?: string;
}
