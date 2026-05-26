"use server";

import { revalidatePath } from "next/cache";

import { FE_PATH, FE_PATH_BUILDER } from "@/auth/routes";
import type {
  AppointmentGroupDetailRow,
  AppointmentGroupRow,
  AppointmentGroupStatus,
} from "@/types/appointment-group.types";
import type { Paginated } from "@/types/pagination.types";

import {
  closeAppointmentGroup,
  getAppointmentGroup,
  listAppointmentGroups,
} from "./appointment-group.api";
import { isApiError } from "./errors";

/**
 * Server actions for F14 multi-visit cases. Wraps `userFetch`-backed API
 * helpers so client components (group detail page's close-case button,
 * future surfaces that need on-demand fetches) can call them without
 * pulling `server-only` into the browser bundle.
 *
 * Errors come back as a discriminated `AppointmentGroupActionResult` —
 * the `ApiError` class loses its prototype crossing the
 * server-action boundary, so we serialise to plain data and let the
 * consumer branch on `result.error.code`.
 */

export interface AppointmentGroupActionError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type AppointmentGroupActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppointmentGroupActionError };

function toActionError(err: unknown): AppointmentGroupActionError {
  if (isApiError(err)) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  return {
    status: 0,
    code: "UNKNOWN_ERROR",
    message: err instanceof Error ? err.message : "Unknown error",
  };
}

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

export async function closeAppointmentGroupAction(
  id: string,
): Promise<AppointmentGroupActionResult<AppointmentGroupDetailRow>> {
  try {
    const closed = await closeAppointmentGroup(id);

    revalidatePath(FE_PATH.APPOINTMENT_GROUPS);
    revalidatePath(FE_PATH_BUILDER.appointmentGroupDetail(id));

    if (closed.appointments.length > 0) {
      for (const member of closed.appointments) {
        revalidatePath(FE_PATH_BUILDER.appointmentDetail(member.id));
      }
    }

    return { ok: true, data: closed };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
