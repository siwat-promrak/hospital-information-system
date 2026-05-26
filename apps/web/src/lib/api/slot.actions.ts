"use server";

import type { AppointmentType } from "@/types/appointment-type.types";
import type { SlotResponse } from "@/types/slot.types";

import { isApiError } from "./errors";
import { listSlots } from "./slot.api";

/**
 * Server actions for the F09 booking wizard's slot-picker step. The slot
 * finder needs to re-fetch whenever the user changes any of
 * `(doctor, department, date, type)` — running through a server action
 * keeps the call cookie-authenticated without exposing `userFetch` to the
 * client bundle.
 *
 * Returns a discriminated `SlotActionResult` so the wizard can show a
 * `400 DEPARTMENT_TYPE_NOT_ALLOWED` toast specifically (the user picked an
 * unsupported `(department, type)` pair) instead of a generic error.
 */

export interface SlotActionError {
  status: number;
  code: string;
  message: string;
}

export type SlotActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SlotActionError };

function toActionError(err: unknown): SlotActionError {
  if (isApiError(err)) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
    };
  }

  return {
    status: 0,
    code: "UNKNOWN_ERROR",
    message: err instanceof Error ? err.message : "Unknown error",
  };
}

interface LoadSlotsArgs {
  /**
   * Optional (F15). When omitted, the BE fans out across every doctor with
   * an active schedule on `(departmentId, date)` and merges their slot
   * grids — the slot finder's "any doctor in this department" workflow.
   */
  doctorId?: string;
  departmentId: string;
  date: string;
  type: AppointmentType;
}

export async function loadSlotsAction(
  args: LoadSlotsArgs,
): Promise<SlotActionResult<readonly SlotResponse[]>> {
  try {
    const slots = await listSlots(args);

    return { ok: true, data: slots };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
