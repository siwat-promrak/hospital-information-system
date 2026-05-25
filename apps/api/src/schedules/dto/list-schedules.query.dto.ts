import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination';
import { SCHEDULE_ISO_DATE_PATTERN } from '../schedules.const';

/**
 * Query DTO for `GET /schedules`. Composes the shared `PaginationQueryDto`
 * (`?page=&pageSize=`) with the filter axes consumed by the calendar /
 * doctor-detail / month-summary views.
 *
 * All filters are AND-combined. Missing filters = no constraint. `from`
 * and `to` are calendar dates (`YYYY-MM-DD`); the service expands them
 * to start-of-day / end-of-day UTC bounds and matches schedules whose
 * `[startAt, endAt)` intersects the range. When BOTH are omitted, the
 * service defaults to the current calendar month.
 */
export class ListSchedulesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '4f3e2a10-1234-5678-9abc-deadbeef1234',
    description: 'Restrict to a single doctor.',
  })
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @ApiPropertyOptional({
    example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
    description: 'Restrict to a single department.',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    example: '2026-06-01',
    description:
      'Inclusive lower bound of the calendar-date filter (`YYYY-MM-DD`). ' +
      'Expanded to start-of-day UTC by the service.',
  })
  @IsOptional()
  @Matches(SCHEDULE_ISO_DATE_PATTERN, {
    message: 'from must be an ISO calendar date (YYYY-MM-DD).',
  })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-06-30',
    description:
      'Inclusive upper bound of the calendar-date filter (`YYYY-MM-DD`). ' +
      'Expanded to end-of-day UTC by the service.',
  })
  @IsOptional()
  @Matches(SCHEDULE_ISO_DATE_PATTERN, {
    message: 'to must be an ISO calendar date (YYYY-MM-DD).',
  })
  to?: string;
}
