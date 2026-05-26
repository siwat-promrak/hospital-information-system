"use server";

import { revalidatePath } from "next/cache";

import { FE_PATH, FE_PATH_BUILDER } from "@/auth/routes";
import type {
  AppointmentResponse,
  CancelAppointmentBody,
  CreateAppointmentBody,
} from "@/types/appointment.types";

import {
  cancelAppointment,
  createAppointment,
} from "./appointment.api";
import { isApiError } from "./errors";

/**
 * Server actions for the F09 booking wizard + cancel dialog. Wraps the
 * typed `userFetch`-backed API so the client components can call mutations
 * without pulling `server-only` code into the client bundle.
 *
 * Each action revalidates the pages that may render the touched row so
 * the fresh state appears without a full reload. Errors are returned as a
 * discriminated `AppointmentActionResult` because the `ApiError` class
 * loses its prototype crossing the server/client boundary — preserving the
 * `code` / `status` / `details` payload as plain data keeps the consumer's
 * branching logic intact.
 */

export interface AppointmentActionError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type AppointmentActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppointmentActionError };

function toActionError(err: unknown): AppointmentActionError {
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

export async function createAppointmentAction(
  body: CreateAppointmentBody,
): Promise<AppointmentActionResult<AppointmentResponse>> {
  try {
    const created = await createAppointment(body);

    revalidatePath(FE_PATH.APPOINTMENTS);
    revalidatePath(FE_PATH_BUILDER.appointmentDetail(created.id));

    return { ok: true, data: created };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function cancelAppointmentAction(
  id: string,
  body: CancelAppointmentBody,
): Promise<AppointmentActionResult<AppointmentResponse>> {
  try {
    const cancelled = await cancelAppointment(id, body);

    revalidatePath(FE_PATH.APPOINTMENTS);
    revalidatePath(FE_PATH_BUILDER.appointmentDetail(id));

    return { ok: true, data: cancelled };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
