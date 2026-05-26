import "server-only";

import type { AppointmentType } from "@/types/appointment-type.types";
import type { SlotResponse } from "@/types/slot.types";

import { userFetch } from "./server-fetch";
import { SLOT_API_PATH, SLOT_QUERY_PARAM } from "./slot.const";

/**
 * Filter tuple for the F07 / F15 slot finder. `departmentId`, `date`, and
 * `type` are REQUIRED; `doctorId` is OPTIONAL (F15) — when omitted, the BE
 * fans out across every doctor with an active schedule on
 * `(departmentId, date)` and merges their slot grids in a single response.
 */
interface ListSlotsParams {
  doctorId?: string;
  departmentId: string;
  date: string;
  type: AppointmentType;
}

/**
 * Slot-finder endpoint (F07 / F15). Every call is server-side on behalf of
 * the signed-in caller — the session cookie travels via `userFetch`, and
 * the BE's `JwtGuard` + `PermissionsGuard` decide whether to serve or 403.
 *
 * F15 widened the permission gate to also accept `schedule.read.all` (any-of
 * with the existing `appointment.create.{own, own-department}` codes), and
 * widened the query DTO so `doctorId` is optional. When `doctorId` is
 * omitted, the BE merges slots across every doctor with an active schedule
 * in `(departmentId, date)` — used by the slot finder's "any doctor in this
 * department" workflow.
 *
 * The endpoint is NOT paginated — the per-doctor per-day grid rarely
 * exceeds a few dozen rows, and even the multi-doctor merge caps at a few
 * hundred rows for a busy department-day — so we build the query string
 * directly with `URLSearchParams` rather than routing through
 * `buildPaginationQuery`.
 *
 * Pre-validation guarantees from the BE:
 *  - `date` for a fully-past day returns `200 []` (not 400) — US-6.2.
 *  - An unknown `(departmentId, type)` pair raises
 *    `400 DEPARTMENT_TYPE_NOT_ALLOWED` (see `SLOT_ERROR_CODE`).
 *  - An unknown / soft-deleted `doctorId` raises `404 NOT_FOUND`.
 */
export function listSlots(
  params: ListSlotsParams,
): Promise<SlotResponse[]> {
  const search = new URLSearchParams({
    [SLOT_QUERY_PARAM.DEPARTMENT_ID]: params.departmentId,
    [SLOT_QUERY_PARAM.DATE]: params.date,
    [SLOT_QUERY_PARAM.TYPE]: params.type,
  });

  if (params.doctorId) {
    search.set(SLOT_QUERY_PARAM.DOCTOR_ID, params.doctorId);
  }

  const path = `${SLOT_API_PATH}?${search.toString()}`;

  return userFetch<SlotResponse[]>(path);
}
