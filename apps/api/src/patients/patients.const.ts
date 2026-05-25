/**
 * Module-level constants for F09 patients module.
 *
 * `PATIENT_HN_PATTERN` mirrors the DB CHECK constraint
 * (`^[0-9]{7,9}$`) — the service applies it as a defence-in-depth check
 * before insert so a programmer error in the generator surfaces as a
 * `500 VALIDATION_FAILED` rather than a raw Postgres error.
 *
 * `PATIENT_HN_LENGTH` is the canonical 8-character target (YY + 6-digit
 * sequence). 7 + 9 are accepted by the DB CHECK so a future hospital
 * with a longer ledger does not require a schema change; the generator
 * pads to 8.
 */
import type { Prisma } from '@prisma/client';

export const PATIENT_HN_PATTERN = /^[0-9]{7,9}$/;
export const PATIENT_HN_LENGTH = 8;

/**
 * Default `orderBy` for `GET /patients` — newest first so the search
 * results read top-down on the booking wizard's "look up walk-in"
 * panel.
 */
export const PATIENT_DB_ORDER_BY: Prisma.PatientOrderByWithRelationInput = {
  createdAt: 'desc',
};
