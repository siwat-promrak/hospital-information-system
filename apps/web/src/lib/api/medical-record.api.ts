import "server-only";

import type {
  CreateMedicalRecordBody,
  MedicalRecordResponse,
  UpdateMedicalRecordBody,
} from "@/types/medical-record.types";
import type { Paginated, PaginationParams } from "@/types/pagination.types";

import {
  MEDICAL_RECORD_API_PATH,
  MEDICAL_RECORD_API_PATH_BUILDER,
  MEDICAL_RECORD_QUERY_PARAM,
} from "./medical-record.const";
import { buildPaginationQuery } from "./pagination";
import { userFetch } from "./server-fetch";

/**
 * Medical-record endpoints (F08+ transport surface). Every call is
 * server-side on behalf of the signed-in caller — the session cookie
 * travels via `userFetch`, and the BE's `JwtGuard` + `PermissionsGuard`
 * decide whether to serve or 403 (gated on `medical_records.*`).
 *
 * This file is the transport layer only: no UI consumes it yet. F08 will
 * wire the list / detail / form pages on top of these clients.
 *
 * The list endpoint is assumed paginated (CLAUDE.md rule 8 — every list
 * endpoint in this codebase uses the shared `Paginated<T>` envelope).
 * Detail / create / update return the bare `MedicalRecordResponse` shape.
 */

interface ListMedicalRecordsParams extends PaginationParams {
  doctorId?: string;
  patientId?: string;
  appointmentId?: string;
  departmentId?: string;
}

export function listMedicalRecords(
  params?: ListMedicalRecordsParams,
): Promise<Paginated<MedicalRecordResponse>> {
  const query = buildPaginationQuery(params, {
    [MEDICAL_RECORD_QUERY_PARAM.DOCTOR_ID]: params?.doctorId,
    [MEDICAL_RECORD_QUERY_PARAM.PATIENT_ID]: params?.patientId,
    [MEDICAL_RECORD_QUERY_PARAM.APPOINTMENT_ID]: params?.appointmentId,
    [MEDICAL_RECORD_QUERY_PARAM.DEPARTMENT_ID]: params?.departmentId,
  });

  return userFetch<Paginated<MedicalRecordResponse>>(
    `${MEDICAL_RECORD_API_PATH}${query}`,
  );
}

export function getMedicalRecord(id: string): Promise<MedicalRecordResponse> {
  return userFetch<MedicalRecordResponse>(
    MEDICAL_RECORD_API_PATH_BUILDER.detail(id),
  );
}

export function createMedicalRecord(
  body: CreateMedicalRecordBody,
): Promise<MedicalRecordResponse> {
  return userFetch<MedicalRecordResponse>(MEDICAL_RECORD_API_PATH, {
    method: "POST",
    body,
  });
}

export function updateMedicalRecord(
  id: string,
  body: UpdateMedicalRecordBody,
): Promise<MedicalRecordResponse> {
  return userFetch<MedicalRecordResponse>(
    MEDICAL_RECORD_API_PATH_BUILDER.detail(id),
    {
      method: "PATCH",
      body,
    },
  );
}
