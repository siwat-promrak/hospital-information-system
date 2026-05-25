/**
 * Constants for the F11-prep medical records module. Centralises the
 * default ordering used by the list endpoint so the DB query and any
 * Swagger description that documents the sort can stay in sync.
 */
import type { Prisma } from '@prisma/client';

/**
 * Default `orderBy` for `GET /medical-records` — newest first so the
 * patient-detail timeline reads correctly without explicit sort args.
 */
export const MEDICAL_RECORD_DB_ORDER_BY: Prisma.MedicalRecordOrderByWithRelationInput =
  { createdAt: 'desc' };
