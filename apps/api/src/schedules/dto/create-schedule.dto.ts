import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional, IsUUID } from 'class-validator';

import { IsScheduleWindowValid } from '../decorators/schedule-window.decorator';

/**
 * Request body for `POST /schedules`. The class-validator decorators take
 * care of per-field shape; the root `@IsScheduleWindowValid()` runs the
 * cross-field invariants (end > start, break inside window, break paired).
 */
export class CreateScheduleDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  @IsUUID()
  doctorId!: string;

  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  @IsUUID()
  departmentId!: string;

  @ApiProperty({
    example: '2026-06-01T09:00:00.000Z',
    description: 'ISO datetime (UTC). Inclusive start of the working window.',
  })
  // Anchor for the cross-field invariants. The decorator inspects the
  // whole DTO via `args.object`, so it does not matter which property
  // hosts it — colocating with `startAt` (always required) keeps the
  // DTO clean.
  @IsScheduleWindowValid()
  @IsISO8601()
  startAt!: string;

  @ApiProperty({
    example: '2026-06-01T12:00:00.000Z',
    description: 'ISO datetime (UTC). Exclusive end of the working window.',
  })
  @IsISO8601()
  endAt!: string;

  @ApiPropertyOptional({
    example: '2026-06-01T10:30:00.000Z',
    nullable: true,
    description:
      'Optional break start (ISO datetime). If set, `breakEndAt` MUST also be set.',
  })
  @IsOptional()
  @IsISO8601()
  breakStartAt?: string;

  @ApiPropertyOptional({
    example: '2026-06-01T11:00:00.000Z',
    nullable: true,
    description:
      'Optional break end (ISO datetime). If set, `breakStartAt` MUST also be set.',
  })
  @IsOptional()
  @IsISO8601()
  breakEndAt?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  acceptsBooking?: boolean;
}
