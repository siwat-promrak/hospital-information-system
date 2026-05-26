import "server-only";

import type { MedicalRecordResponse } from "@/types/medical-record.types";
import type { Paginated, PaginationParams } from "@/types/pagination.types";

import {
  MEDICAL_RECORD_API_PATH,
  MEDICAL_RECORD_API_PATH_BUILDER,
  MEDICAL_RECORD_QUERY_PARAM,
} from "./medical-record.const";
import { buildPaginationQuery } from "./pagination";
import { userFetch } from "./server-fetch";

/**
 * Medical-record endpoints (F08 / F17). Every call is server-side on behalf
 * of the signed-in caller — the session cookie travels via `userFetch`, and
 * the BE's `JwtGuard` + `PermissionsGuard` decide whether to serve or 403
 * (gated on `medical_records.read.all` for reads).
 *
 * F17 delta: `POST /medical-records` and `PATCH /medical-records/:id` are
 * REMOVED — record creation now happens inside the workspace action
 * endpoints (`/appointments/:id/complete|refer|follow-up`), and records
 * are write-once (immutable). This file retains only `listMedicalRecords`
 * and `getMedicalRecord`.
 *
 * The list endpoint is paginated (CLAUDE.md rule 8). The `pageSize=all`
 * sentinel is valid here — `AppointmentVisitThread` uses it to fetch the
 * full prior-visit history for a case in a single round-trip.
 */

interface ListMedicalRecordsParams extends PaginationParams {
  doctorId?: string;
  patientId?: string;
  appointmentId?: string;
  departmentId?: string;
  /**
   * F17 — fetch all medical records belonging to the same appointment group.
   * Used by `AppointmentVisitThread` to render the doctor's full visit
   * history for a case. Pass `pageSize=all` alongside this filter to avoid
   * pagination — visit threads are rarely more than a handful of rows.
   */
  appointmentGroupId?: string;
}

export function listMedicalRecords(
  params?: ListMedicalRecordsParams,
): Promise<Paginated<MedicalRecordResponse>> {
  const query = buildPaginationQuery(params, {
    [MEDICAL_RECORD_QUERY_PARAM.DOCTOR_ID]: params?.doctorId,
    [MEDICAL_RECORD_QUERY_PARAM.PATIENT_ID]: params?.patientId,
    [MEDICAL_RECORD_QUERY_PARAM.APPOINTMENT_ID]: params?.appointmentId,
    [MEDICAL_RECORD_QUERY_PARAM.DEPARTMENT_ID]: params?.departmentId,
    [MEDICAL_RECORD_QUERY_PARAM.APPOINTMENT_GROUP_ID]: params?.appointmentGroupId,
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
