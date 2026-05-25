/**
 * Module-level constants for F07 slot finder.
 *
 * Rule 2b — every semantic string literal that crosses the wire (or is
 * compared with `===` to a separate file's literal) lives in a named
 * constant. Currently this file only carries the slot-specific error code;
 * the query-parameter names are aliased on the DTO via `@ApiQuery` because
 * they are not consumed anywhere else inside the BE.
 */

import { AppointmentStatus } from '@prisma/client';

import { ErrorCode } from '../common/errors';

/**
 * Slot-specific error codes. Other codes the endpoint may emit
 * (`INSUFFICIENT_PERMISSION`, `NOT_FOUND`, `VALIDATION_FAILED`) belong to
 * the shared catalog at `../common/errors.ts`. Re-exporting from a single
 * place keeps the service free of magic strings.
 */
export const SLOT_ERROR_CODE = {
  DEPARTMENT_TYPE_NOT_ALLOWED: ErrorCode.DEPARTMENT_TYPE_NOT_ALLOWED,
} as const;

/**
 * ISO calendar-date wire format (`YYYY-MM-DD`) for the `date` query param.
 * Reused by the class-validator `@Matches()` on `FindSlotsQueryDto.date`.
 */
export const SLOT_ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Statuses that block a slot. Per US-6.2: `BOOKED` + `COMPLETED` block; any
 * appointment whose `[startAt, endAt)` intersects a candidate slot causes
 * the slot to be excluded. `CANCELLED` does NOT block — the slot is
 * immediately re-bookable (frees the slot for reuse).
 *
 * Declared as a `readonly` literal tuple so Prisma's `status: { in: […] }`
 * filter gets the strict `AppointmentStatus[]` shape.
 */
export const BLOCKING_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.COMPLETED,
];
