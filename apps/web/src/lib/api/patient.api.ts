import "server-only";

import type {
  CreatePatientBody,
  PatientResponse,
} from "@/types/patient.types";
import type { Paginated, PaginationParams } from "@/types/pagination.types";

import { buildPaginationQuery } from "./pagination";
import {
  PATIENT_API_PATH,
  PATIENT_QUERY_PARAM,
} from "./patient.const";
import { userFetch } from "./server-fetch";

/**
 * Patient endpoints (F09). Every call is server-side on behalf of the
 * signed-in caller — the session cookie travels via `userFetch`, and the
 * BE's `JwtGuard` + `PermissionsGuard` decide whether to serve or 403
 * (gated on `patient.*`).
 *
 * `GET /patients` paginates and accepts a single free-text `q` filter
 * across name (en/th), phone, identification number, and HN. The booking
 * wizard's patient picker drives this with a debounced typeahead.
 */

interface ListPatientsParams extends PaginationParams {
  q?: string;
}

export function listPatients(
  params?: ListPatientsParams,
): Promise<Paginated<PatientResponse>> {
  const query = buildPaginationQuery(params, {
    [PATIENT_QUERY_PARAM.Q]: params?.q,
  });

  return userFetch<Paginated<PatientResponse>>(
    `${PATIENT_API_PATH}${query}`,
  );
}

export function createPatient(
  body: CreatePatientBody,
): Promise<PatientResponse> {
  return userFetch<PatientResponse>(PATIENT_API_PATH, {
    method: "POST",
    body,
  });
}
