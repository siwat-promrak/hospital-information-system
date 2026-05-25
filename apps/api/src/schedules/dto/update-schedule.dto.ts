import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional, IsUUID } from 'class-validator';

import { IsScheduleWindowValid } from '../decorators/schedule-window.decorator';

/**
 * Request body for `PATCH /schedules/:id`. All fields optional — service
 * merges over the existing row, then re-runs affiliation + overlap checks
 * against the merged shape.
 *
 * `doctorId` is intentionally excluded: moving a schedule between doctors
 * is out of scope for F06 (would require re-validating affiliations + a new
 * audit trail). `departmentId` IS editable because a doctor often picks
 * up a different department after the schedule was first created.
 *
 * The cross-field `@IsScheduleWindowValid()` decorator runs against
 * whichever subset of fields the caller sent — checks that involve a
 * missing field are skipped, so the validator only fails on a partial
 * payload when the SENT fields actively conflict (e.g. sending both
 * `breakStartAt` and `breakEndAt` with start >= end).
 */
export class UpdateScheduleDto {
  @ApiPropertyOptional({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ example: '2026-06-01T09:00:00.000Z' })
  @IsOptional()
  @IsScheduleWindowValid()
  @IsISO8601()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-06-01T12:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @ApiPropertyOptional({ example: '2026-06-01T10:30:00.000Z', nullable: true })
  @IsOptional()
  @IsISO8601()
  breakStartAt?: string;

  @ApiPropertyOptional({ example: '2026-06-01T11:00:00.000Z', nullable: true })
  @IsOptional()
  @IsISO8601()
  breakEndAt?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  acceptsBooking?: boolean;
}
