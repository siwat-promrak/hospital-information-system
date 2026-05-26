/**
 * Module-level constants for the global `GET /appointment-types` endpoint.
 *
 * Post-F13 the global catalog is a PURE LABEL CATALOG — the per-type slot
 * duration moved off this map and onto
 * `DepartmentAppointmentType.durationMinutes` (one row per
 * `(department, type)` pair). The booking wizard reads the per-pair
 * catalog via the new `GET /departments/:id/appointment-types`.
 *
 * Labels are English-only — the FE re-keys them through
 * `Common.AppointmentType.*` in F12 if Thai parity is needed (the BE
 * returns en-only).
 */
import { AppointmentType } from '@prisma/client';

import type { AppointmentTypeEntry } from './appointment-types.types';

/**
 * Human-readable English labels for each appointment type. Surfaced on
 * the wire alongside `code`; the FE may i18n-overlay them via
 * `Common.AppointmentType.*` (F12). Keyed by the Prisma enum so adding a
 * new value forces this map to be updated.
 */
export const APPOINTMENT_TYPE_LABEL: Record<AppointmentType, string> = {
  [AppointmentType.NEW_PATIENT_VISIT]: 'New patient visit',
  [AppointmentType.FOLLOW_UP]: 'Follow-up',
  [AppointmentType.CONSULTATION]: 'Consultation',
  [AppointmentType.PROCEDURE]: 'Procedure',
} as const;

/**
 * Stable list-order for the `/appointment-types` response. Order matches
 * the Prisma enum declaration so a renderer iterating `Object.values()` and
 * a renderer iterating this catalog see the same sequence.
 */
export const APPOINTMENT_TYPE_ORDER: readonly AppointmentType[] = [
  AppointmentType.NEW_PATIENT_VISIT,
  AppointmentType.FOLLOW_UP,
  AppointmentType.CONSULTATION,
  AppointmentType.PROCEDURE,
];

/**
 * Frozen catalog — `[{ code, label }]` for every `AppointmentType`.
 * Returned verbatim by `AppointmentTypesController#list` so the controller
 * stays a one-liner and tests can assert against the exported value
 * directly. Per-pair duration + booking window live on
 * `GET /departments/:id/appointment-types` (F13).
 */
export const APPOINTMENT_TYPE_CATALOG: readonly AppointmentTypeEntry[] =
  APPOINTMENT_TYPE_ORDER.map((code) => ({
    code,
    label: APPOINTMENT_TYPE_LABEL[code],
  }));
