/**
 * Module-level constants for F09 appointments.
 *
 * Default `orderBy` for `GET /appointments` is `startAt ASC` so the
 * booking-board view reads chronologically (next appointment first).
 * The list endpoint overrides this when the caller passes `?order=desc`.
 */
import { AppointmentStatus, type Prisma } from '@prisma/client';

export const APPOINTMENT_DB_ORDER_ASC: Prisma.AppointmentOrderByWithRelationInput =
  { startAt: 'asc' };

export const APPOINTMENT_DB_ORDER_DESC: Prisma.AppointmentOrderByWithRelationInput =
  { startAt: 'desc' };

/**
 * Statuses that block a slot (mirror of `BLOCKING_APPOINTMENT_STATUSES`
 * in F07). Booking re-check inside the transaction queries this set.
 * `CANCELLED` is intentionally absent — a cancelled appointment frees
 * the slot for immediate reuse (US-6.2).
 */
export const BLOCKING_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.COMPLETED,
];

/**
 * Wire constants for `?order=asc|desc` on `GET /appointments`. The DTO
 * validates against this set; the service maps to the matching Prisma
 * `orderBy` constant above.
 */
export const APPOINTMENT_LIST_ORDER = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

export type AppointmentListOrder =
  (typeof APPOINTMENT_LIST_ORDER)[keyof typeof APPOINTMENT_LIST_ORDER];
