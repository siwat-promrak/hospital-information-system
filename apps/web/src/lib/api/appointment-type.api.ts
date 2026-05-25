import "server-only";

import type { AppointmentTypeResponse } from "@/types/appointment-type.types";

import { APPOINTMENT_TYPE_API_PATH } from "./appointment-type.const";
import { userFetch } from "./server-fetch";

/**
 * Appointment-type catalog endpoint (F07). Every call is server-side on
 * behalf of the signed-in caller — the session cookie travels via
 * `userFetch`, and the BE's `JwtGuard` + `PermissionsGuard` decide whether to
 * serve or 403 (gated on `appointment.create`).
 *
 * The catalog is static per-deploy (four entries, one per Prisma
 * `AppointmentType` enum value), so the F08 booking wizard caches the result
 * at page mount and re-uses `durationMinutes` to compute booking previews
 * without re-fetching.
 */
export function listAppointmentTypes(): Promise<AppointmentTypeResponse[]> {
  return userFetch<AppointmentTypeResponse[]>(APPOINTMENT_TYPE_API_PATH);
}
