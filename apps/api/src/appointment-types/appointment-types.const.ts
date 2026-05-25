/**
 * Module-level constants for the F07 `/appointment-types` endpoint.
 *
 * The per-`AppointmentType` duration map is the canonical source of truth
 * used by:
 *  - `GET /appointment-types` (this module's controller — surfaces the map
 *    on the wire so the FE can render the booking-wizard type picker), and
 *  - `SlotsService` (F07 slot grid step), and
 *  - F08 `AppointmentsService` (computes `endAt = startAt + duration` at
 *    booking time).
 *
 * Stored in application code rather than a DB table per the spec: the four
 * values are stable per-deploy and don't need an admin UI to manage.
 * Adding a category is a code change (extend the Prisma `AppointmentType`
 * enum + this map + the matching `department_appointment_types` seed).
 *
 * Labels are English-only — the FE re-keys them through `Common.AppointmentType.*`
 * in F12 if Thai parity is needed (the BE returns en-only).
 */
import { AppointmentType } from '@prisma/client';

import type { AppointmentTypeEntry } from './appointment-types.types';

/**
 * Per-type slot duration in minutes. Keyed by the Prisma `AppointmentType`
 * enum so adding a new enum value forces this map to be updated (TS will
 * flag the missing key at compile time).
 */
export const APPOINTMENT_TYPE_DURATION_MINUTES: Record<
  AppointmentType,
  number
> = {
  [AppointmentType.NEW_PATIENT_VISIT]: 30,
  [AppointmentType.FOLLOW_UP]: 15,
  [AppointmentType.CONSULTATION]: 20,
  [AppointmentType.PROCEDURE]: 60,
} as const;

/**
 * Human-readable English labels for each appointment type. Surfaced on the
 * wire alongside `code` + `durationMinutes`; the FE may i18n-overlay them
 * via `Common.AppointmentType.*` (F12). Keyed by the Prisma enum so adding
 * a new value forces this map to be updated.
 */
export const APPOINTMENT_TYPE_LABEL: Record<AppointmentType, string> = {
  [AppointmentType.NEW_PATIENT_VISIT]: 'New patient visit',
  [AppointmentType.FOLLOW_UP]: 'Follow-up',
  [AppointmentType.CONSULTATION]: 'Consultation',
  [AppointmentType.PROCEDURE]: 'Procedure',
} as const;

/**
 * Stable list-order for the `/appointment-types` response. Order matches
 * the Prisma enum declaration so a renderer iterating Object.values() and
 * a renderer iterating this catalog see the same sequence.
 */
export const APPOINTMENT_TYPE_ORDER: readonly AppointmentType[] = [
  AppointmentType.NEW_PATIENT_VISIT,
  AppointmentType.FOLLOW_UP,
  AppointmentType.CONSULTATION,
  AppointmentType.PROCEDURE,
];

/**
 * Frozen catalog — `[{ code, label, durationMinutes }]` for every
 * `AppointmentType`. Returned verbatim by `AppointmentTypesController#list`
 * so the controller stays a one-liner and tests can assert against the
 * exported value directly.
 */
export const APPOINTMENT_TYPE_CATALOG: readonly AppointmentTypeEntry[] =
  APPOINTMENT_TYPE_ORDER.map((code) => ({
    code,
    label: APPOINTMENT_TYPE_LABEL[code],
    durationMinutes: APPOINTMENT_TYPE_DURATION_MINUTES[code],
  }));
