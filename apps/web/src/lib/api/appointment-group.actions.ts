"use server";

import type {
  AppointmentGroupDetailRow,
  AppointmentGroupRow,
  AppointmentGroupStatus,
} from "@/types/appointment-group.types";
import type { Paginated } from "@/types/pagination.types";

import {
  getAppointmentGroup,
  listAppointmentGroups,
} from "./appointment-group.api";

/**
 * Server actions for F14 multi-visit cases. Wraps `userFetch`-backed API
 * helpers so client components (group detail page, future surfaces that
 * need on-demand fetches) can call them without pulling `server-only` into
 * the browser bundle.
 *
 * F18 delta: `closeAppointmentGroupAction` is removed — the
 * `POST /appointment-groups/:id/close` route is retired. Case closing is
 * now folded into `POST /appointments/:id/complete` on the BE.
 */

interface ListAppointmentGroupsActionArgs {
  page?: number;
  pageSize?: number;
  patientId?: string;
  status?: AppointmentGroupStatus;
}

export async function listAppointmentGroupsAction(
  args: ListAppointmentGroupsActionArgs,
): Promise<Paginated<AppointmentGroupRow>> {
  return await listAppointmentGroups(args);
}

export async function getAppointmentGroupAction(
  id: string,
): Promise<AppointmentGroupDetailRow> {
  return await getAppointmentGroup(id);
}
