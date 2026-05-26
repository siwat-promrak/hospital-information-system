"use server";

import { revalidatePath } from "next/cache";

import { FE_PATH } from "@/auth/routes";
import type {
  CreatePatientBody,
  PatientResponse,
} from "@/types/patient.types";
import type { Paginated } from "@/types/pagination.types";

import { isApiError } from "./errors";
import { createPatient, listPatients } from "./patient.api";
import { PATIENT_PICKER_PAGE_SIZE } from "./patient.const";

/**
 * Server actions exposed to client components for the F09 booking wizard.
 * Wraps the typed `userFetch`-backed API so the wizard can call mutations
 * + typeahead-style reads without pulling `server-only` code into the
 * client bundle.
 *
 * `searchPatientsAction` is the booking wizard's patient typeahead — it
 * forwards the user's typed query through `?q=` and returns the BE
 * pagination envelope. `createPatientAction` is the walk-in registration
 * form's submit handler — returns a discriminated `PatientActionResult`
 * because the `ApiError` class loses its prototype crossing the
 * server/client boundary.
 */

export interface PatientActionError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type PatientActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PatientActionError };

function toActionError(err: unknown): PatientActionError {
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

interface SearchPatientsActionArgs {
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function searchPatientsAction(
  args: SearchPatientsActionArgs,
): Promise<Paginated<PatientResponse>> {
  return await listPatients({
    q: args.q,
    page: args.page,
    pageSize: args.pageSize ?? PATIENT_PICKER_PAGE_SIZE,
  });
}

export async function createPatientAction(
  body: CreatePatientBody,
): Promise<PatientActionResult<PatientResponse>> {
  try {
    const created = await createPatient(body);

    // Revalidate the appointments / patients surfaces that may render the
    // new patient (booking wizard step 1 typeahead seed, future patient
    // directory). Cheap — both surfaces re-render in milliseconds.
    revalidatePath(FE_PATH.APPOINTMENTS_NEW);
    revalidatePath(FE_PATH.PATIENTS);

    return { ok: true, data: created };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
