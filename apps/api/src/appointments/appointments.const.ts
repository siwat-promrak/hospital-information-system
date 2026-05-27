/**
 * Module-level constants for F09 appointments.
 *
 * Default `orderBy` for `GET /appointments` is `startAt ASC` so the
 * booking-board view reads chronologically (next appointment first).
 * The list endpoint overrides this when the caller passes `?order=desc`.
 */
import { AppointmentStatus, AppointmentType, type Prisma } from '@prisma/client';

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

/**
 * F14 — continuation visits (booking with `previousAppointmentId`) MUST
 * carry one of these appointment types. `NEW_PATIENT_VISIT` is by
 * definition not a continuation; every other type — FOLLOW_UP, PROCEDURE,
 * and CONSULTATION — continues an existing clinical thread.
 *
 * Partition (complementary, exhaustive over AppointmentType):
 *   Standalone  → NEW_PATIENT_VISIT
 *   Continuation → FOLLOW_UP | PROCEDURE | CONSULTATION
 *
 * The check fires inside `AppointmentsService.create` after the
 * prev-visit precondition cluster and before the per-(department, type)
 * allowed-types lookup, surfacing as
 * `400 CONTINUATION_APPOINTMENT_TYPE_INVALID`.
 */
export const CONTINUATION_APPOINTMENT_TYPES = [
  AppointmentType.FOLLOW_UP,
  AppointmentType.PROCEDURE,
  AppointmentType.CONSULTATION,
] as const;

export type ContinuationAppointmentType =
  (typeof CONTINUATION_APPOINTMENT_TYPES)[number];

/**
 * Standalone visits (booking WITHOUT `previousAppointmentId`) MUST carry
 * `NEW_PATIENT_VISIT`. Follow-ups, consultations and procedures all
 * presuppose an existing clinical thread and therefore require a
 * `previousAppointmentId`.
 *
 * The check fires inside `AppointmentsService.createInTransaction` in the
 * `!dto.previousAppointmentId` branch (after `resolveGrouping` returns),
 * surfacing as `400 STANDALONE_APPOINTMENT_TYPE_INVALID`.
 */
export const STANDALONE_APPOINTMENT_TYPES = [
  AppointmentType.NEW_PATIENT_VISIT,
] as const;

export type StandaloneAppointmentType =
  (typeof STANDALONE_APPOINTMENT_TYPES)[number];

/**
 * F18 — fallback duration used by `POST /appointments/:id/follow-up`
 * when the doctor's department has no `(departmentId, FOLLOW_UP)` row
 * in `department_appointment_types`. A follow-up is a continuation of
 * an existing visit that the department already accepted, so a missing
 * catalog row must not block the action; we substitute this default and
 * use an open booking window. Standalone bookings remain strict and
 * still surface `DEPARTMENT_TYPE_NOT_ALLOWED` when the catalog row is
 * missing.
 *
 * Mirrors the seed default for FOLLOW_UP in
 * `apps/api/prisma/seed/department-appointment-types.ts`.
 */
export const FOLLOW_UP_DEFAULT_DURATION_MINUTES = 15;
