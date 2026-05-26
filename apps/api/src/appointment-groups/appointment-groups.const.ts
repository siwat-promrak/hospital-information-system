/**
 * Module-level constants for F14 appointment groups.
 *
 * The `?status=` filter on `GET /appointment-groups` is a tri-state
 * sentinel (`open` / `closed` / `all`). Wire constants live here so the
 * DTO validator, the service-layer narrowing, and the Swagger schema
 * share one source of truth.
 *
 * The Prisma `orderBy` constants centralise the chronological sort
 * applied to both the group list (newest-opened first) and the member
 * list inside a group detail (oldest-start first — the clinical
 * timeline reads start → finish).
 */
import type { Prisma } from '@prisma/client';

/**
 * Tri-state filter for `GET /appointment-groups?status=`. `'all'` is
 * the default; `'open'` narrows to `closedAt IS NULL`; `'closed'`
 * narrows to `closedAt IS NOT NULL`.
 */
export const APPOINTMENT_GROUP_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
  ALL: 'all',
} as const;

export type AppointmentGroupStatusFilter =
  (typeof APPOINTMENT_GROUP_STATUS)[keyof typeof APPOINTMENT_GROUP_STATUS];

export const APPOINTMENT_GROUP_STATUS_VALUES: readonly AppointmentGroupStatusFilter[] = [
  APPOINTMENT_GROUP_STATUS.OPEN,
  APPOINTMENT_GROUP_STATUS.CLOSED,
  APPOINTMENT_GROUP_STATUS.ALL,
];

/**
 * Default `orderBy` for `GET /appointment-groups` — newest-opened first
 * so the patient-detail timeline reads the most recent thread at the
 * top.
 */
export const APPOINTMENT_GROUP_DB_ORDER_BY: Prisma.AppointmentGroupOrderByWithRelationInput =
  { openedAt: 'desc' };

/**
 * Chronological order for the member list inside a single group detail.
 * The clinical timeline reads start → finish, so we sort ascending on
 * `startAt` (and `visitNumber` as the deterministic tie-breaker — both
 * are populated together).
 */
export const APPOINTMENT_GROUP_MEMBER_DB_ORDER_BY: Prisma.AppointmentOrderByWithRelationInput[] =
  [{ startAt: 'asc' }, { visitNumber: 'asc' }];
