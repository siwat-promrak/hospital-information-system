import "server-only";

import type { AppointmentType } from "@/types/appointment-type.types";
import type { SlotResponse } from "@/types/slot.types";

import { userFetch } from "./server-fetch";
import { SLOT_API_PATH, SLOT_QUERY_PARAM } from "./slot.const";

/** Required filter tuple for the F07 slot finder — every field is mandatory. */
interface ListSlotsParams {
  doctorId: string;
  departmentId: string;
  date: string;
  type: AppointmentType;
}

/**
 * Slot-finder endpoint (F07). Every call is server-side on behalf of the
 * signed-in caller — the session cookie travels via `userFetch`, and the
 * BE's `JwtGuard` + `PermissionsGuard` decide whether to serve or 403
 * (gated on `appointment.create`).
 *
 * All four query params are REQUIRED. The slot finder is dimension-locked
 * on a single `(doctor, department, date, type)` tuple; changing any of the
 * four on the FE MUST re-issue a fresh call and discard the previous
 * selection (a slot from a different tuple is semantically a different
 * object — see the handoff's "Filter reset" note).
 *
 * The endpoint is NOT paginated — the per-doctor per-day grid rarely exceeds
 * a few dozen rows — so we build the query string directly with
 * `URLSearchParams` rather than routing through `buildPaginationQuery`.
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
    [SLOT_QUERY_PARAM.DOCTOR_ID]: params.doctorId,
    [SLOT_QUERY_PARAM.DEPARTMENT_ID]: params.departmentId,
    [SLOT_QUERY_PARAM.DATE]: params.date,
    [SLOT_QUERY_PARAM.TYPE]: params.type,
  });

  const path = `${SLOT_API_PATH}?${search.toString()}`;

  return userFetch<SlotResponse[]>(path);
}
