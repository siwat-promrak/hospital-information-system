"use server";

import { revalidatePath } from "next/cache";

import { FE_PATH } from "@/auth/routes";
import type {
  CreateScheduleBody,
  ScheduleResponse,
  UpdateScheduleBody,
} from "@/types/schedule.types";

import { isApiError } from "./errors";
import {
  createSchedule,
  deleteSchedule,
  updateSchedule,
} from "./schedule.api";

/**
 * Server actions exposed to the schedule modal (a client component). Wrap
 * the typed `userFetch`-backed API so the modal can call mutations without
 * pulling `server-only` code into the client bundle.
 *
 * Each action revalidates the two pages that render the calendar so the
 * fresh row appears without a full reload. Errors are returned as a
 * discriminated `ScheduleActionResult` because the `ApiError` class loses
 * its prototype crossing the server/client boundary — preserving the
 * `code` / `status` / `details` payload as plain data keeps the modal's
 * branching logic intact.
 */

export interface ScheduleActionError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ScheduleActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ScheduleActionError };

function toActionError(err: unknown): ScheduleActionError {
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

function revalidateSchedulePages(): void {
  // Only one schedule surface after the page consolidation — the unified
  // permission-aware `/schedules` page covers every caller (DOCTOR / NURSE
  // / MRO). The legacy `/me/schedule` route is gone.
  revalidatePath(FE_PATH.SCHEDULES);
}

export async function createScheduleAction(
  body: CreateScheduleBody,
): Promise<ScheduleActionResult<ScheduleResponse>> {
  try {
    const created = await createSchedule(body);

    revalidateSchedulePages();

    return { ok: true, data: created };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateScheduleAction(
  id: string,
  body: UpdateScheduleBody,
): Promise<ScheduleActionResult<ScheduleResponse>> {
  try {
    const updated = await updateSchedule(id, body);

    revalidateSchedulePages();

    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deleteScheduleAction(
  id: string,
): Promise<ScheduleActionResult<null>> {
  try {
    await deleteSchedule(id);

    revalidateSchedulePages();

    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
