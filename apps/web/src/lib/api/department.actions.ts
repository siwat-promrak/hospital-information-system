"use server";

import type { DepartmentAppointmentTypeRow } from "@/types/department.types";

import { getDepartmentAppointmentTypes } from "./department.api";

/**
 * Server-action wrapper around `getDepartmentAppointmentTypes`. The
 * booking wizard runs in the client and cannot call `userFetch` directly
 * — that helper is `server-only` and forwards the session cookie via
 * `next/headers`. The wizard fetches the per-(department, type) catalog
 * once a department is picked; surfacing the call as a server action
 * lets the cookie-authenticated round-trip stay in the React server
 * runtime while the wizard drives it from a `useTransition` / `useEffect`.
 */
export async function getDepartmentAppointmentTypesAction(
  departmentId: string,
): Promise<DepartmentAppointmentTypeRow[]> {
  return await getDepartmentAppointmentTypes(departmentId);
}
