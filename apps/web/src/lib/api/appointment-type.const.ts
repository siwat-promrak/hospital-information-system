/**
 * Appointment-type API URL constants (F07) — endpoint path consumed by the
 * `GET /appointment-types` typed client.
 *
 * The endpoint takes no query params (the catalog is static per-deploy and
 * filter-less), so this file is just a single named alias of `BE_PATH`. Lives
 * next to `appointment-type.api.ts` so the URL contract has a single home
 * (CLAUDE.md rule 2b — no magic strings).
 */

import { BE_PATH } from "@/auth/routes";

/**
 * Re-exported from `BE_PATH` so callers import the appointment-type-specific
 * constant from `lib/api/appointment-type.const.ts` instead of reaching into
 * the cross-tier auth catalog.
 */
export const APPOINTMENT_TYPE_API_PATH = BE_PATH.APPOINTMENT_TYPES;
